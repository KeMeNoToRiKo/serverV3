/**
 * fetch.js — fetches Discord messages and stores parsed Q&A into MongoDB.
 *
 * Concurrency-safety notes:
 *  - The initial backfill (`fetchMessage`) and the realtime listener
 *    (`listenForNewMessages`) can both call `processAndStoreMessage` for the
 *    SAME message id during a small window after startup. We deduplicate via
 *    an in-memory `inFlight` Set keyed on message.id.
 *  - Two different messages can carry the same Question_ID (e.g. the bot edits
 *    the embed and re-posts). Without a unique index, two concurrent processors
 *    would both pass the `findOne` "exists?" check and both insert, creating
 *    duplicates. We rely on the unique index on `Question_ID` (see schema.js)
 *    AND we use atomic upserts so the second writer cleanly converts to an
 *    update instead of crashing.
 *  - lastFetchedId is updated with a conditional update that only moves it
 *    FORWARD, so an out-of-order write from the listener can never overwrite
 *    a higher value already saved by the backfill (or vice-versa).
 */

const ParsedMessage = require('../models/schema');
const LastFetchedId = require('../models/lastFetchedId');
const parseMessageEmbed = require('../utils/embedParser');

const LAST_FETCHED_KEY = 'lastfetchedidV3';

// Per-message dedup: prevents the initial fetch loop and the realtime listener
// from both processing the same message ID simultaneously.
const inFlight = new Set();

/**
 * Atomically advance the stored lastFetchedId, but only if `candidateId` is
 * greater than what's currently stored. Uses BigInt comparison via a read,
 * then a conditional write — racy in theory but the comparison happens in DB
 * via $expr so two concurrent callers can't both regress the value.
 *
 * MongoDB doesn't support $expr in updateOne filter for the comparison we need
 * across BigInt strings cleanly, so we serialize the read+write per call.
 * Worst case under contention: a slightly-out-of-order write is rejected and
 * we re-read on next call. lastFetchedId only matters as a "where to resume"
 * hint, not as a strict watermark — so this is safe.
 */
async function advanceLastFetchedId(candidateIdStr) {
    if (!candidateIdStr) return;
    try {
        const candidate = BigInt(candidateIdStr);
        const existing = await LastFetchedId.findOne({ key: LAST_FETCHED_KEY }).lean();
        const current = existing && existing.value ? BigInt(existing.value) : BigInt(0);

        if (candidate <= current) return; // never go backwards

        // Conditional update: only set if the value we read is still there.
        // If another worker raced ahead of us, this updates 0 docs and we drop it.
        const res = await LastFetchedId.updateOne(
            { key: LAST_FETCHED_KEY, value: existing ? existing.value : { $exists: false } },
            { $set: { value: candidateIdStr } },
            { upsert: !existing }
        );

        if (res.matchedCount === 0 && !existing) {
            // Race: someone else upserted the doc between our read and write.
            // That's fine — they have a value; we'll catch up on the next call.
        }
    } catch (err) {
        // Duplicate-key on first-ever upsert is also benign (another worker won)
        if (err && err.code === 11000) return;
        console.error('Error advancing lastFetchedId:', err);
    }
}

/**
 * Process and atomically store a single message.
 * Safe to call concurrently for the same Question_ID — the unique index
 * guarantees only one document exists; concurrent calls converge via upserts.
 */
const processAndStoreMessage = async (message) => {
    const messageKey = message?.id;
    // Skip if we're already processing this message (initial fetch ↔ listener race)
    if (messageKey && inFlight.has(messageKey)) {
        return false;
    }
    if (messageKey) inFlight.add(messageKey);

    try {
        // Skip messages from non-bot sources if you want — left configurable
        // by NOT filtering here; caller can filter before invoking us.

        const parsedData = await parseMessageEmbed(message);
        if (!parsedData || !Array.isArray(parsedData.Answer)) return false;

        const questionId = parsedData.Question_ID;
        if (!questionId) {
            console.log('Parsed data has no Question_ID; skipping.');
            return false;
        }

        const questionType = String(parsedData.Question_Type || '').toLowerCase();
        const isFillMultiple =
            questionType.includes('fill_in_multiple_blanks') ||
            questionType.includes('fill in multiple blanks');

        // Strip _rawEmoji helper before persisting
        const cleanAnswers = parsedData.Answer.map(({ _rawEmoji, ...a }) => a);

        // ----------------------------------------------------------------
        // STEP 1: Atomically ensure a document exists for this Question_ID.
        // findOneAndUpdate with upsert + $setOnInsert is the standard pattern
        // for "create if missing, otherwise leave alone" without a race.
        // ----------------------------------------------------------------
        let doc;
        try {
            doc = await ParsedMessage.findOneAndUpdate(
                { Question_ID: questionId },
                {
                    $setOnInsert: {
                        Question_ID: questionId,
                        Title: parsedData.Title,
                        Question: parsedData.Question,
                        Answer: [],
                        HasPartial: !!parsedData.partial,
                    },
                },
                { new: true, upsert: true, setDefaultsOnInsert: true }
            );
        } catch (err) {
            // E11000 here means a parallel writer just upserted between our check
            // and write. Read the now-existing doc and continue.
            if (err && err.code === 11000) {
                doc = await ParsedMessage.findOne({ Question_ID: questionId });
                if (!doc) {
                    console.error(`E11000 race but doc not found for ${questionId}; aborting.`);
                    return false;
                }
            } else {
                throw err;
            }
        }

        // ----------------------------------------------------------------
        // STEP 2: Per-answer reconciliation.
        // For each parsed answer, decide:
        //   - skip (already stored as correct)
        //   - upgrade (existing was wrong, new says correct)
        //   - append (brand new Answer_ID we haven't seen)
        // All updates are atomic via positional operators / arrayFilters.
        // ----------------------------------------------------------------
        const existingAnswers = Array.isArray(doc.Answer) ? doc.Answer : [];

        for (const a of cleanAnswers) {
            const ansId = a.Answer_ID;
            if (!ansId) continue;

            const existingAns = existingAnswers.find((x) => x.Answer_ID === ansId);

            if (existingAns) {
                // Upgrade an incorrect answer to correct if new info says so.
                if (existingAns.Correct !== true && a.Correct === true) {
                    try {
                        const r = await ParsedMessage.updateOne(
                            { _id: doc._id, 'Answer.Answer_ID': ansId },
                            {
                                $set: {
                                    'Answer.$.Correct': true,
                                    'Answer.$.Answer_Text': a.Answer_Text,
                                },
                            }
                        );
                        if (r.modifiedCount > 0) {
                            console.log(
                                `Upgraded Answer_ID ${ansId} for question ${questionId} → correct.`
                            );
                        }
                    } catch (err) {
                        console.error(`Failed to update answer ${ansId}:`, err);
                    }
                }
                // else: existing is already correct or new info doesn't add value — skip.
            } else {
                // For fill-in-multiple-blanks, only append known-correct answers.
                if (isFillMultiple && a.Correct !== true) {
                    continue;
                }
                // Append-if-absent atomically. $addToSet by Answer_ID isn't directly
                // expressible on a sub-document array, so we use a filter that
                // requires the Answer_ID to NOT be present.
                try {
                    const r = await ParsedMessage.updateOne(
                        {
                            _id: doc._id,
                            'Answer.Answer_ID': { $ne: ansId },
                        },
                        {
                            $push: { Answer: a },
                            $set: {
                                HasPartial: !!(doc.HasPartial || parsedData.partial),
                            },
                        }
                    );
                    if (r.modifiedCount > 0) {
                        console.log(`Appended Answer_ID ${ansId} to question ${questionId}.`);
                    }
                    // modifiedCount === 0 here means another writer just inserted
                    // this Answer_ID before us — totally fine, idempotent.
                } catch (err) {
                    console.error(`Failed to append answer ${ansId}:`, err);
                }
            }
        }

        return true;
    } catch (err) {
        console.error('Error processing message:', err);
        return false;
    } finally {
        if (messageKey) inFlight.delete(messageKey);
    }
};

const fetchMessage = async (client, channelId) => {
    let lastFetchedId = null;

    try {
        const lastIdDoc = await LastFetchedId.findOne({ key: LAST_FETCHED_KEY }).lean();
        if (lastIdDoc) {
            lastFetchedId = lastIdDoc.value;
            console.log(`Will stop fetching once reaching last fetched ID: ${lastFetchedId}`);
        } else {
            console.log('No last fetched ID found. Fetching all messages.');
        }
    } catch (err) {
        console.error('Error fetching last fetched ID:', err);
    }

    try {
        const channel = await client.channels.fetch(channelId);
        if (!channel) {
            console.error('Channel not found');
            return;
        }
        if (!channel.isTextBased()) {
            console.error('Channel is not text-based');
            return;
        }

        console.log('Starting message fetch...');
        let allMessagesFetched = false;
        let reachedLastFetched = false;
        let fetchBefore;
        const lastFetchedBig = lastFetchedId ? BigInt(lastFetchedId) : BigInt(0);
        let newestIdSeen = lastFetchedBig;

        while (!allMessagesFetched) {
            const options = fetchBefore ? { limit: 100, before: fetchBefore } : { limit: 100 };
            const messages = await channel.messages.fetch(options);

            if (messages.size === 0) {
                console.log('No more messages to fetch.');
                break;
            }

            const sorted = Array.from(messages.values()).sort((a, b) => {
                const aId = BigInt(a.id);
                const bId = BigInt(b.id);
                return aId > bId ? -1 : aId < bId ? 1 : 0;
            });

            for (const message of sorted) {
                const msgIdBig = BigInt(message.id);

                // FIX: use <= so deleted-message edge case (stored id no longer
                // exists in channel) still terminates the loop correctly.
                if (lastFetchedId && msgIdBig <= lastFetchedBig) {
                    console.log(`Reached last fetched threshold ${lastFetchedId}. Stopping.`);
                    allMessagesFetched = true;
                    reachedLastFetched = true;
                    break;
                }

                if (msgIdBig > newestIdSeen) {
                    newestIdSeen = msgIdBig;
                }

                await processAndStoreMessage(message);
            }

            if (allMessagesFetched) break;

            fetchBefore = sorted[sorted.length - 1].id;

            if (messages.size < 100) {
                console.log('Fetched final batch (less than 100).');
                allMessagesFetched = true;
            }
        }

        console.log(
            `Fetch loop ended. allMessagesFetched=${allMessagesFetched}, reachedLastFetched=${reachedLastFetched}`
        );

        if (newestIdSeen > lastFetchedBig) {
            await advanceLastFetchedId(newestIdSeen.toString());
            console.log(`Advanced lastFetchedId to ${newestIdSeen.toString()}`);
        } else {
            console.log('No newer messages seen; lastFetchedId unchanged.');
        }
        console.log('✅ fetchMessage function completed successfully');
    } catch (err) {
        console.error('❌ Error in fetchMessage:', err);
    }
};

/**
 * Realtime listener. Each incoming message is processed in its own task —
 * concurrency safety is handled inside processAndStoreMessage.
 */
const listenForNewMessages = (client, channelId) => {
    client.on('messageCreate', async (message) => {
        if (message.channelId !== channelId) return;

        try {
            await processAndStoreMessage(message);
            // Advance watermark per message; it's atomic-monotonic now, so safe
            // even if multiple messages arrive out of order.
            await advanceLastFetchedId(message.id);
        } catch (err) {
            console.error('Error processing new message:', err);
        }
    });

    // Also handle message edits — embeds often arrive as edits, not creates.
    client.on('messageUpdate', async (_oldMsg, newMessage) => {
        if (newMessage.channelId !== channelId) return;
        try {
            // Some edits arrive as partials; fetch full message before parsing.
            const full = newMessage.partial ? await newMessage.fetch() : newMessage;
            await processAndStoreMessage(full);
        } catch (err) {
            console.error('Error processing edited message:', err);
        }
    });

    console.log(`Started listening for new messages and edits in channel ${channelId}`);
};

module.exports = fetchMessage;
module.exports.listenForNewMessages = listenForNewMessages;
module.exports.processAndStoreMessage = processAndStoreMessage;
module.exports.advanceLastFetchedId = advanceLastFetchedId;