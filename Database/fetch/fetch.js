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

        let allMessagesFetched = false;
        let reachedLastFetched = false;

        let fetchBefore = undefined; // Start from the newest messages
        let newestIdSeen = lastFetchedId ? BigInt(lastFetchedId) : BigInt(0);

        while (!allMessagesFetched) {
            const options = fetchBefore ? { limit: 100, before: fetchBefore } : { limit: 100 };
            console.log('Fetching messages with options:', options);

            const messages = await channel.messages.fetch(options);

            if (messages.size === 0) {
                console.log('No more messages to fetch.');
                break;
            }

            // Sort oldest → newest for consistent processing
            const sorted = Array.from(messages.values()).sort((a, b) => {
            const aId = BigInt(a.id);
            const bId = BigInt(b.id);
            if (aId < bId) return -1;
            if (aId > bId) return 1;
            return 0;
        });


            for (const message of sorted) {
                console.log(`Fetched message ID: ${message.id}`);
                 // Convert to BigInt once
                const msgIdBig = BigInt(message.id);

                // --- Stop early if we've reached the last fetched ID ---
                if (lastFetchedId && msgIdBig === BigInt(lastFetchedId)) {
                    console.log(`Reached last fetched ID ${lastFetchedId}. Stopping.`);
                    allMessagesFetched = true;
                    reachedLastFetched = true;   // <--- NEW FLAG
                    break; 
                }
                // Update newest ID seen
                // --- Update newest ID seen (only if not stopping) ---
                if (msgIdBig > newestIdSeen) {
                    newestIdSeen = msgIdBig;
                }

                // --- Parse message embeds ---
                const parsedData = await parseMessageEmbed(message);
                if (!parsedData || !Array.isArray(parsedData.Answer)) continue;

                const questionId = parsedData.Question_ID;
                if (!questionId) {
                    console.log('Parsed data has no Question_ID; skipping.');
                    continue;
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
                    continue;
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
            }

            // Stop if loop was broken by reaching lastFetchedId
            if (allMessagesFetched) break;

            // Pagination: fetch older messages next
            fetchBefore = sorted[0].id;
            console.log(`Continuing fetch before message ID: ${fetchBefore}`);

            // If we got fewer than 100, it’s the last batch
            if (messages.size < 100) {
                console.log('Fetched final batch (less than 100).');
                allMessagesFetched = true;
            }
        }

        // --- Update last fetched ID after full run ---
        const upsertKey = 'lastfetchedidV3';

        if (!reachedLastFetched) {
            // Normal run: update to newest seen
            await LastFetchedId.updateOne(
                { key: upsertKey },
                { $set: { value: newestIdSeen.toString() } },
                { upsert: true }
            );
            console.log(`Updated ${upsertKey} to ${newestIdSeen.toString()}`);
        } else {
            // Stopped early: do NOT overwrite stored lastFetchedId
            console.log(`Not updating ${upsertKey} because we stopped at existing fetched ID.`);
        }



    } catch (err) {
        console.error('Error fetching channel:', err);
    }
};

module.exports = fetchMessage;
