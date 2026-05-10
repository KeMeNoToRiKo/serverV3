/**
 *  TO DO:
 *  - fix fetching logic to stop at last fetched id ✅ DONE
 *  - FIX SCHEMA WHEN RELEASING
 */

const fs = require('fs');
const path = require('path');

const ParsedMessage = require('../models/schema');
const LastFetchedId = require('../models/lastFetchedId');
const parseMessageEmbed = require('../utils/embedParser');

// --- Separate function to process and store a single message ---
const processAndStoreMessage = async (message) => {
    try {
        // --- Parse message embeds ---
        const parsedData = await parseMessageEmbed(message);
        if (!parsedData || !Array.isArray(parsedData.Answer)) return false;

        const questionId = parsedData.Question_ID;
        if (!questionId) {
            console.log('Parsed data has no Question_ID; skipping.');
            return false;
        }

        // --- Check existing entries ---
        const existing = await ParsedMessage.findOne({ 'Answer.Question_ID': questionId });
        const existingHasCorrect = !!(
            existing &&
            existing.Answer &&
            existing.Answer.some(a => a.Question_ID === questionId && a.Correct === true)
        );
        if (existingHasCorrect) {
            console.log(`Question ${questionId} already has a correct answer. Skipping.`);
            return false;
        }

        // --- Process answers ---
        const questionType = String(parsedData.Question_Type || '').toLowerCase();
        const isFillMultiple =
            questionType.includes('fill_in_multiple_blanks') ||
            questionType.includes('fill in multiple blanks');

        const answersToAppend = [];

        for (const a of parsedData.Answer) {
            const ansId = a.Answer_ID;
            const existingAns =
                existing && existing.Answer
                    ? existing.Answer.find(x => x.Answer_ID === ansId)
                    : null;

            if (existingAns) {
                if (existingAns.Correct === false && a.Correct === true) {
                    try {
                        await ParsedMessage.updateOne(
                            { _id: existing._id, 'Answer.Answer_ID': ansId },
                            {
                                $set: {
                                    'Answer.$.Correct': true,
                                    'Answer.$.Answer_Text': a.Answer_Text,
                                },
                            }
                        );
                        console.log(
                            `Updated Answer_ID ${ansId} for question ${questionId}: marked correct.`
                        );
                    } catch (err) {
                        console.error(`Failed to update answer ${ansId}:`, err);
                    }
                }
            } else {
                if (isFillMultiple && a.Correct === false) {
                    console.log(
                        `Skipping incorrect answer ${ansId} (fill-in-multiple-blanks).`
                    );
                    continue;
                }
                answersToAppend.push(a);
            }
        }

        // --- Save to database ---
        if (!existing) {
            if (answersToAppend.length > 0) {
                const doc = new ParsedMessage({
                    Title: parsedData.Title,
                    Question: parsedData.Question,
                    Answer: answersToAppend,
                    HasPartial: !!parsedData.partial,
                });
                await doc.save();
                console.log(
                    `Inserted new question ${questionId} with ${answersToAppend.length} answers.`
                );
            } else {
                console.log('No new answers to insert for new question.');
            }
        } else {
            if (answersToAppend.length > 0) {
                await ParsedMessage.updateOne(
                    { _id: existing._id },
                    {
                        $push: { Answer: { $each: answersToAppend } },
                        $set: { HasPartial: existing.HasPartial || !!parsedData.partial },
                    }
                );
                console.log(
                    `Appended ${answersToAppend.length} answers to question ${questionId}.`
                );
            }
        }
        return true;
    } catch (err) {
        console.error('Error processing message:', err);
        return false;
    }
};

const fetchMessage = async (client, channelId) => {
    let lastFetchedId = null;

    // --- Get last fetched message ID from DB ---
    try {
        const lastIdDoc = await LastFetchedId.findOne({ key: 'lastfetchedidV3' });
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

        let fetchBefore = undefined; // Start from the newest messages
        let newestIdSeen = lastFetchedId ? BigInt(lastFetchedId) : BigInt(0);
        console.log(`Initial newestIdSeen: ${newestIdSeen.toString()}`);

        while (!allMessagesFetched) {
            const options = fetchBefore ? { limit: 100, before: fetchBefore } : { limit: 100 };
            console.log('Fetching messages with options:', options);

            const messages = await channel.messages.fetch(options);

            if (messages.size === 0) {
                console.log('No more messages to fetch.');
                break;
            }

            // Sort newest → oldest so we always process newest first and can exit cleanly
            const sorted = Array.from(messages.values()).sort((a, b) => {
                const aId = BigInt(a.id);
                const bId = BigInt(b.id);
                if (aId > bId) return -1;
                if (aId < bId) return 1;
                return 0;
            });

            for (const message of sorted) {
                console.log(`Fetched message ID: ${message.id}`);
                // Convert to BigInt once
                const msgIdBig = BigInt(message.id);

                // --- Stop early if we've reached or passed the last fetched ID ---
                if (lastFetchedId && msgIdBig === BigInt(lastFetchedId)) {
                    console.log(`Reached last fetched ID ${lastFetchedId}. Stopping.`);
                    allMessagesFetched = true;
                    reachedLastFetched = true;
                    break;
                }

                // Update newest ID seen
                if (msgIdBig > newestIdSeen) {
                    newestIdSeen = msgIdBig;
                    console.log(`Updated newestIdSeen to: ${newestIdSeen.toString()}`);
                }

                // --- Process and store message using the separate function ---
                await processAndStoreMessage(message);
            }

            // Stop if loop was broken by reaching lastFetchedId
            if (allMessagesFetched) break;

            // Pagination: fetch older messages next (last element is now the oldest)
            fetchBefore = sorted[sorted.length - 1].id;
            console.log(`Continuing fetch before message ID: ${fetchBefore}`);

            // If we got fewer than 100, it’s the last batch
            if (messages.size < 100) {
                console.log('Fetched final batch (less than 100).');
                allMessagesFetched = true;
            }
        }
        console.log(`Fetch loop ended. allMessagesFetched=${allMessagesFetched}, reachedLastFetched=${reachedLastFetched}`);
        console.log(`Final newestIdSeen: ${newestIdSeen.toString()}`);
        // --- Update last fetched ID after full run ---
        console.log('Fetch loop completed. Attempting to update lastFetchedId...');
        const upsertKey = 'lastfetchedidV3';

        try {
            // Only update the stored lastFetchedId if we've seen a newer message than what's stored.
            const storedBig = lastFetchedId ? BigInt(lastFetchedId) : BigInt(0);
            console.log(`newestIdSeen: ${newestIdSeen.toString()}, storedBig: ${storedBig.toString()}`);
            if (newestIdSeen > storedBig) {
                await LastFetchedId.updateOne(
                    { key: upsertKey },
                    { $set: { value: newestIdSeen.toString() } },
                    { upsert: true }
                );
                console.log(`✅ Successfully updated ${upsertKey} to ${newestIdSeen.toString()}`);
            } else {
                console.log(
                    `ℹ️ Not updating ${upsertKey}: stored lastFetchedId (${lastFetchedId}) is newer or equal.`
                );
            }
        } catch (err) {
            console.error('Error updating last fetched ID after fetch run:', err);
        }
        
        console.log('✅ fetchMessage function completed successfully');

    } catch (err) {
        console.error('❌ Error in fetchMessage:', err);
    }
};

// --- Function to listen for new messages and process them ---
const listenForNewMessages = (client, channelId) => {
    let lastMessageTime = null;
    let updateTimeout = null;

    client.on('messageCreate', async (message) => {
        // Only process messages from the specified channel
        if (message.channelId !== channelId) return;

        console.log(`New message received in channel ${channelId}: ${message.id}`);

        try {
            // Process the new message using the same function
            const processed = await processAndStoreMessage(message);

            // Clear any pending update timeout
            if (updateTimeout) {
                clearTimeout(updateTimeout);
            }

            // Set a new timeout to update lastFetchedId after 5 seconds of inactivity
            const msgIdBig = BigInt(message.id);
            updateTimeout = setTimeout(async () => {
                try {
                    await LastFetchedId.updateOne(
                        { key: 'lastfetchedidV3' },
                        { $set: { value: msgIdBig.toString() } },
                        { upsert: true }
                    );
                    console.log(`Updated lastFetchedId to ${msgIdBig.toString()}`);
                    updateTimeout = null;
                } catch (err) {
                    console.error('Error updating lastFetchedId:', err);
                }
            }, 5000); // 5 seconds

            lastMessageTime = Date.now();
        } catch (err) {
            console.error('Error processing new message:', err);
        }
    });
    console.log(`Started listening for new messages in channel ${channelId}`);
};

module.exports = fetchMessage;
module.exports.listenForNewMessages = listenForNewMessages;
module.exports.processAndStoreMessage = processAndStoreMessage;
