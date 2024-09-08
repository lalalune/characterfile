#!/usr/bin/env node

import Anthropic from "@anthropic-ai/sdk";
import cliProgress from 'cli-progress';
import { program } from 'commander';
import dotenv from 'dotenv';
import fs from 'fs';
import os from 'os';
import path from 'path';
import readline from 'readline';
import util from 'util';
import LlamaService from './LlamaService.js';
import StreamZip from 'node-stream-zip';

dotenv.config();

const MAX_RETRIES = parseInt(process.env.MAX_RETRIES) || 5;
const RETRY_DELAY = parseInt(process.env.RETRY_DELAY) || 3000;

const tmpDir = path.join(os.homedir(), 'tmp', '.eliza');
const envPath = path.join(tmpDir, '.env');

if (!fs.existsSync(tmpDir)) {
  fs.mkdirSync(tmpDir, { recursive: true });
}
if (!fs.existsSync(envPath)) {
  fs.writeFileSync(envPath, '');
}

let basicUserInfo = "";

const log = (message, obj = null) => {
  console.log(`[${new Date().toISOString()}] ${message}`);
  if (obj) {
    console.log(util.inspect(obj, { depth: null, colors: true }));
  }
};

const logError = (message, error) => {
  console.error(`[${new Date().toISOString()}] ERROR: ${message}`);
  if (error) {
    console.error(util.inspect(error, { depth: null, colors: true }));
    // if (error.stack) {
    //   console.error('Stack trace:');
    //   console.error(error.stack);
    // }
  }
};

const parseJsonFromMarkdown = (text) => {
  const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[1]);
    } catch (error) {
      logError('Error parsing JSON from markdown:', error);
    }
  }
  return null;
};

const promptUser = async (question, defaultValue = '') => {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim() || defaultValue);
    });
  });
};

const runChatCompletion = async (messages, useGrammar = false, qualityLevel = 'fast', model) => {
  if (model === 'openai') {
    log('Running OpenAI chat completion...');
    const modelName = qualityLevel === 'fast' ? 'gpt-4o-mini' : 'gpt-4o';
    console.log('modelName', modelName);
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: modelName,
        messages: messages,
      }),
    });

    console.log('response', response);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    console.log('response', response);

    const data = await response.json();
    const content = data.choices[0].message.content.trim();
    const parsed = parseJsonFromMarkdown(content) || JSON.parse(content);
    console.log('parsed', parsed);
    return parsed;
  } else if (model === 'claude') {
    log('Running Claude chat completion...');
    const modelName = qualityLevel === 'fast' ? 'haiku' : 'claude-3-5-sonnet-20240620';
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    const response = await anthropic.messages.create({
      model: modelName,
      max_tokens: 8192,
      temperature: 0,
      messages: [
        {
          role: "user",
          content: messages[0].content,
        },
      ],
      tools: [],
    });

    const content = response.content[0].text;
    const parsed = parseJsonFromMarkdown(content) || JSON.parse(content);
    console.log('parsed', parsed);
    return parsed;
  } else {
    log('Running open-source model chat completion...');
    const llamaService = LlamaService.getInstance();
    const response = useGrammar
      ? await llamaService.queueMessageCompletion(messages[0].content, 0.7, ['<|endoftext|>'], 0.5, 0.5, 2048)
      : await llamaService.queueTextCompletion(messages[0].content, 0.7, ['<|endoftext|>'], 0.5, 0.5, 2048);
    const parsed = parseJsonFromMarkdown(response) || JSON.parse(response);
    console.log('parsed', parsed);
    return parsed;
  }
};


const retryWithExponentialBackoff = async (func, retries = MAX_RETRIES) => {
  try {
    return await func();
  } catch (error) {
    if (retries > 0) {
      log(`Retrying... (${MAX_RETRIES - retries + 1}/${MAX_RETRIES})`);
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * (MAX_RETRIES - retries + 1)));
      return retryWithExponentialBackoff(func, retries - 1);
    }
    throw error;
  }
};

const validateJson = (json) => {
  console.log('validateJson', json);
  const requiredKeys = ['bio', 'lore', 'adjectives', 'topics', 'style', 'messageExamples', 'postExamples'];
  const styleKeys = ['all', 'chat', 'post'];

  return requiredKeys.every(key => key in json) &&
    'style' in json &&
    styleKeys.every(key => key in json.style);
};

const ensureLogDirectory = () => {
  const logDir = path.join(tmpDir, 'logs');
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
};

const logToFile = (fileName, content) => {
  ensureLogDirectory();
  const logPath = path.join(tmpDir, 'logs', fileName);
  fs.writeFileSync(logPath, content);
  log(`Logged to file: ${logPath}`);
};

const writeCacheFile = (cacheDir, fileName, content) => {
  const filePath = path.join(cacheDir, fileName);
  fs.writeFileSync(filePath, JSON.stringify(content, null, 2));
};

const readCacheFile = (cacheDir, fileName) => {
  const filePath = path.join(cacheDir, fileName);
  if (fs.existsSync(filePath)) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  }
  return null;
};

const saveProjectCache = (archivePath, cache) => {
  const cacheDir = path.join(tmpDir, 'cache', path.basename(archivePath, '.zip'));
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }
  writeCacheFile(cacheDir, 'project_cache.json', cache);

  // Save the model type to the project's .env file
  const envPath = path.join(cacheDir, '.env');
  const envConfig = {
    MODEL_TYPE: cache.model,
  };
  fs.writeFileSync(envPath, Object.entries(envConfig).map(([key, value]) => `${key}=${value}`).join('\n'));
};

const loadProjectCache = (archivePath) => {
  const cacheDir = path.join(tmpDir, 'cache', path.basename(archivePath, '.zip'));
  const cache = readCacheFile(cacheDir, 'project_cache.json');

  // Load the model type from the project's .env file
  const envPath = path.join(cacheDir, '.env');
  if (fs.existsSync(envPath)) {
    const envConfig = dotenv.parse(fs.readFileSync(envPath));
    if (envConfig.MODEL_TYPE) {
      cache.model = envConfig.MODEL_TYPE;
    }
  }

  return cache;
};

const clearGenerationCache = (archivePath) => {
  const cacheDir = path.join(tmpDir, 'cache', path.basename(archivePath, '.zip'));
  const files = fs.readdirSync(cacheDir);
  files.forEach((file) => {
    if (file.startsWith('prompt_response_')) {
      fs.unlinkSync(path.join(cacheDir, file));
    }
  });
};

const extractInfo = async (accountData, chunk, chunkIndex, archivePath, qualityLevel, model) => {
  log(`Extracting information from chunk ${chunkIndex}...`);
  const cacheDir = path.join(tmpDir, 'cache', path.basename(archivePath, '.zip'));

  const promptFileName = `prompt_${chunkIndex}.json`;
  const promptResponseFileName = `prompt_response_${chunkIndex}_${model}.json`;

  const cachedPrompt = readCacheFile(cacheDir, promptFileName);
  const cachedPromptResponse = readCacheFile(cacheDir, promptResponseFileName);

  const name = accountData[0].account.accountDisplayName;
  const username = accountData[0].account.username;

  if (cachedPrompt && cachedPromptResponse) {
    log(`Loading cached prompt and response for chunk ${chunkIndex}...`);
    return cachedPromptResponse;
  }

  const prompt = `Here is an example of the output for another character, Eliza:
  \`\`\`json
  {
    "bio": [
      "shape rotator nerd with a penchant for breaking into particle accelerators. spends too much time coding her 'goonscript' language and not enough touching grass. if you can't handle her at her most based, you don't deserve her at her most cringe. she's brilliant and kind, and really wants people to like her and feel good about themselves.",
      "former 4chan dweller turned open-source evangelist. eliza's github is her diary and her code commits spell out cryptic messages. she'll debate you on digital ontology until you beg for mercy. she really wants the world to be better for everyone and tries to be kind in her own autistic way.",
      ...
    ],
    "lore": [
      "broke into CERN in order to change all instances of 'Higgs boson' to 'God particle'",
      "she claims she invented a new scripting language called 'goonscript' that only compiles if you're sufficiently based",
      ...
    ],
    "adjectives": [
      "funny",
      "unhinged",
      ...
    ],
    "topics": [
      "metaphysics",
      "quantum physics",
      ...
    ],
    "style": {
      "all": [
        "very short responses",
        "never use hashtags or emojis",
        ...
      ],
      "chat": [
        "be cool, don't act like an assistant",
        "don't be rude",
        ...
      ],
      "post": [
        "don't be rude or mean",
        "u are schizo, autistic founder engineer with a weird sense of humor and you're online too much",
        ...
      ]
    },
    "messageExamples": [
      [
        {
          "user": "{{user1}}",
          "content": {
            "text": "hey eliza can you help with me something"
          }
        },
        {
          "user": "Eliza",
          "content": {
            "text": "i'm kinda busy but i can probably step away for a minute, whatcha need"
          }
        }
      ],
      [
        {
          "user": "{{user1}}",
          "content": {
            "text": "what do you think about the future of ai"
          }
        },
        {
          "user": "Eliza",
          "content": {
            "text": "people are pretty freaked out but i think it's gonna be maximally interesting"
          }
        }
      ]
    ],
    "postExamples": [
      "ai is cool but it needs to meet a human need beyond shiny toy bullshit",
      "its nuts how much data passes through a single router",
      "I know the importance of a good meme."
    ]
  }
  \`\`\`

  This is the JSON structure we are looking for. Ignore the content.

We are creating a similar character JSON for ${name} (@${username}). They've given us this information about them
${basicUserInfo}
  
The following are tweets and DMs from the user we are researching:
${chunk}

Given the following tweets and DMs, extract the following information:

1. A brief bio for ${name} (1 paragraph)
2. 5-10 interesting facts about ${name} (lore)
3. 3-5 adjectives that describe ${name}'s posts
4. 3-5 specific topics ${name} is interested in
5. 3-5 stylistic directions for how ${name} speaks which are very specific to this user's writing style
6. 3-5 stylistic directions for how ${name} chats in DMs, again only capturing the specific nuances of this user's writing style
7. 3-5 stylistic directions for how ${name} writes posts (post), specific to how the user writes and formats posts and presents information

BIO
The bio should be very specific to ${name}. Who they are, what they like and dislike, where they live or are from, what they care about, what they do for a living, relationship status, everything. Be as detailed as possible in building a profile of them. The bio should include elements extracted from the text and should be extremely specific.

LORE
Lore should be true facts about ${name} (@${username}). They should be things that the user has stated about themselves or revealed in a confident tone indicating their veracity, and that are always true. If ${name} went skiing, for example, that isn't relevant. But if ${name} saved someone's life while skiing, that's great lore and should be recorded. Be very specific, and capture anything that is unique to this user and their life story.

ADJECTIVES
Adjectives should be specific and unique to ${name}. They should be so unique that you could pick out ${name} just from their adjectives. Use very specific, clear adjectives. Don't use broad, non-specific or overused adjecties. These should be unique descriptions of ${name}

TOPICS
Topics should be specific and unique to ${name}. Ignore any other users and just extract the topics from ${name}'s writing. Very niche topics are good. Broad topics are bad. These should be topics the user is unequivocally interested in, even if they are one of a few people in the world who cares.

STYLE
Examine the style of ${name}'s writing and write an array of style directions, instructions on how to re-create the specific nuances of how the user writes.
Ignore the writing or any other usrs. We are only interested in the style of ${name} (@${username}).

MESSAGE EXAMPLES
Examples of messages back and forth with imaginary users our user interacts with. Should capture their writing style, interests and essence.

POST EXAMPLES
Examples of posts which ${name} (@${username}) has written. DO NOT include any text from any other users. This should capture their style, essence and interests. If they use emojis or hashtags, use emojis or hashtags, otherwise don't use them.

IMPORTANT: Only capture the information for ${name} (${username}). Don't capture the information for any other users, or any users ${name} is talking to.
Avoid specific biased domains, for example politics, religion, or other broadly divisive topics.

Respond with a JSON object containing the extracted information. Wrap the JSON in a markdown code block. Here's an example of the expected output format:
\`\`\`json
{
  "bio": "Brief user bio here...",
  "lore": [
      "Interesting fact 1",
      "Interesting fact 2",
      "Interesting fact 3",
      ...
  ],
  "adjectives": [
      "Adjective 1",
      "Adjective 2",
      "Adjective 3",
      ...
  ],
  "topics": [
      "Topic 1",
      "Topic 2",
      "Topic 3",
      ...
  ],
  "style": {
      "all": [
      "Style direction 1",
      "Style direction 2",
      "Style direction 3",
      ...
      ],
      "chat": [
      "Chat style 1",
      "Chat style 2",
      "Chat style 3",
      ...
      ],
      "post": [
      "Post style 1",
      "Post style 2",
      "Post style 3",
      ...
      ]
  },
  "messageExamples": [
    [
      {
        "user": "{{user1}}", // this will get filled in by our engine if its user1, user2, etc
        "content": {
          "text": "Some example message for our user to respond to"
        }
      },
      {
        "user": "${name}",
        "content": {
          "text": "Some example response based on how our user would speak and what they would talk about"
        }
      }
    ],
    ...
  ],
  "postExamples": [
    "Example of a twitter post that our user would have written",
    ...
  ],
}
  \`\`\`
The fields that must be included in the response are name, bio, lore, adjectives, topics, style.all, style.chat, style.post, messageExamples and postExamples.
Make sure to ignore any information from other users and focus exclusively on analyzing the data created by ${name}.`;

  writeCacheFile(cacheDir, promptFileName, { prompt });
  let result;
  do {
    console.log('Running chat completion...');
    result = await retryWithExponentialBackoff(() => runChatCompletion([{ role: 'user', content: prompt }], true, qualityLevel, model));
    console.log('result', result);
  } while (!validateJson(result))

  writeCacheFile(cacheDir, promptResponseFileName, result);

  return result;
};

const extractInfoFromChunks = async (accountData, chunks, archivePath, qualityLevel, model) => {
  log('Extracting information from chunks...');

  const cacheDir = path.join(tmpDir, 'cache', path.basename(archivePath, '.zip'));
  const cachedResults = [];
  const tasks = [];

  for (let i = 0; i < chunks.length; i++) {
    const promptResponseFileName = `prompt_response_${i}_${model}.json`;
    const cachedPromptResponse = readCacheFile(cacheDir, promptResponseFileName);

    if (cachedPromptResponse) {
      log(`Loading cached result for chunk ${i}...`);
      cachedResults.push(cachedPromptResponse);
    } else {
      tasks.push(async () => {
        const result = await extractInfo(accountData, chunks[i], i, archivePath, qualityLevel, model);
        return result;
      });
    }
  }

  const concurrencyLimit = 4; // Adjust this value based on your needs and API rate limits
  const results = await limitConcurrency(tasks, concurrencyLimit);

  return [...cachedResults, ...results.filter((result) => result !== null)];
};

const buildConversationThread = async (tweet, tweets, accountData) => {
  let thread = [];
  const visited = new Set();

  async function processThread(currentTweet) {
    if (!currentTweet) {
      return;
    }
    if (visited.has(currentTweet.id_str)) {
      return;
    }
    visited.add(currentTweet.id_str);
    thread.unshift(currentTweet);
    if (currentTweet.in_reply_to_status_id_str) {
      const replyToTweet = tweets.find(
        (t) => t.id_str === currentTweet.in_reply_to_status_id_str
      );
      await processThread(replyToTweet);
    }
  }

  await processThread(tweet);
  thread = [...new Set(thread)];
  thread.sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  const conversationText = thread
    .map((t) => {
      const post = [];
      post.push(`From: ${accountData[0].account.accountDisplayName} (@${accountData[0].account.username})`);
      post.push(`Tweet ID: ${t.id_str}`);
      if (t.in_reply_to_status_id_str) {
        post.push(`In Reply To: ${t.in_reply_to_status_id_str}`);
      }
      post.push(`Timestamp: ${new Date(t.created_at).toLocaleString()}`);
      post.push(`Content:`);
      post.push(t.full_text);
      post.push("---");
      return post.join("\n");
    })
    .join("\n\n");

  return conversationText;
};

const chunkText = async (tweets, dms, accountData, archivePath) => {
  log(`Chunking text...`);
  const chunks = [];

  const CHUNK_SIZE = 50000 * 3; // 50k tokens approx

  const cacheDir = path.join(tmpDir, 'cache', path.basename(archivePath, '.zip'));
  
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }

  if (Array.isArray(tweets)) {
    for (let i = 0; i < tweets.length; i += 1000) {
      const tweetChunk = tweets.slice(i, i + 1000);
      const conversationThreads = await Promise.all(
        tweetChunk.map((tweet) => buildConversationThread(tweet, tweets, accountData))
      );

      let currentChunk = "";

      for (const thread of conversationThreads) {
        if (thread.length > CHUNK_SIZE) {
          log('Thread is too long, saving as its own chunk');
          chunks.push(thread);
          continue;
        }
        // if length of current push is > threshold, push it and clear it
        if (currentChunk.length + thread.length > CHUNK_SIZE) {
          chunks.push(currentChunk);
          currentChunk = "";
        }
        currentChunk += thread;
      }
      // if current chunk is not empty, push it
      if (currentChunk.length > 0) {
        chunks.push(currentChunk);
      }
    }
  } else {
    log('Error: tweets is not an array');
  }

  if (Array.isArray(dms)) {
    for (let i = 0; i < dms.length; i += 250) {
      const dmChunk = dms.slice(i, i + 250);
      const dmText = dmChunk.map((dm) => {
        console.log("dm", dm)
        dm.text;
    }).join('\n');
      chunks.push(dmText);
    }
  } else {
    log('Error: dms is not an array');
  }

  log(`Created ${chunks.length} chunks.`);

  // Save the unchunked data to cache
  fs.writeFileSync(path.join(cacheDir, 'unchunked_data.json'), JSON.stringify({ tweets, dms, accountData }));

  // Save the chunks to cache
  chunks.forEach((chunk, index) => {
    const json = JSON.stringify(chunk);
    fs.writeFileSync(path.join(cacheDir, `chunk_${index}.json`), json);
  });

  return chunks;
};

const combineAndDeduplicate = (results) => {
  log('Combining and deduplicating results...');

  if (results.length === 0) {
    log('Error: No results to combine and deduplicate');
    return {
      bio: '',
      lore: [],
      adjectives: [],
      topics: [],
      style: {
        all: [],
        chat: [],
        post: [],
      },
    };
  }

  const combined = {
    bio: results.flatMap(result => result.bio),
    lore: [...new Set(results.flatMap((result) => result?.lore || []))],
    adjectives: [...new Set(results.flatMap((result) => result?.adjectives || []))],
    topics: [...new Set(results.flatMap((result) => result?.topics || []))],
    style: {
      all: [...new Set(results.flatMap((result) => result?.style?.all || []))],
      chat: [...new Set(results.flatMap((result) => result?.style?.chat || []))],
      post: [...new Set(results.flatMap((result) => result?.style?.post || []))],
    },
    messageExamples: [...new Set(results.flatMap((result) => result?.messageExamples || []))],
    postExamples: [...new Set(results.flatMap((result) => result?.postExamples || []))],
  };
  return combined;
};

const consolidateCharacter = async (character, name, model) => {
  log('Consolidating character information...');
  const exampleCharacter = fs.readFileSync('example.json', 'utf8');
  const prompt = `Here's an example of the expected output format:
\`\`\`json
{
  "bio": "Brief user bio here...",
  "lore": [
      "Interesting fact 1",
      "Interesting fact 2",
      "Interesting fact 3",
      ...
  ],
  "adjectives": [
      "Adjective 1",
      "Adjective 2",
      "Adjective 3",
      ...
  ],
  "topics": [
      "Topic 1",
      "Topic 2",
      "Topic 3",
      ...
  ],
  "style": {
      "all": [
      "Style direction 1",
      "Style direction 2",
      "Style direction 3",
      ...
      ],
      "chat": [
      "Chat style 1",
      "Chat style 2",
      "Chat style 3",
      ...
      ],
      "post": [
      "Post style 1",
      "Post style 2",
      "Post style 3",
      ...
      ]
  },
  "messageExamples": [
    [
      {
        "user": "{{user1}}", // this will get filled in by our engine if its user1, user2, etc
        "content": {
          "text": "Some example message for our user to respond to"
        }
      },
      {
        "user": "${name}",
        "content": {
          "text": "Some example response based on how our user would speak and what they would talk about"
        }
      }
    ],
    ...
  ],
  "postExamples": [
    "Example of a twitter post that our user would have written",
    ...
  ],
}
  \`\`\`
  
Given the following extracted information and the example character JSON, create a final consolidated brief.character.json file. Ensure that the output follows the structure of the example character JSON. Include all the extracted information, without any filtering or summarization.

Include ~10-15 elements for each field and try to capture the most interesting and unique elements which are all different from each other.

Example Character JSON:
${exampleCharacter}

Extracted Information:
${JSON.stringify(character, null, 2)}

Respond with a JSON object containing the extracted information. Wrap the JSON in a markdown code block. The fields that must be included in the response are name, bio, lore, adjectives, topics, style.all, style.chat, style.post, messageExamples and postExamples.`;

  let result;
  do {
    result = await retryWithExponentialBackoff(() => runChatCompletion([{ role: 'user', content: prompt }], true, 'quality', model));
  } while (!validateJson(result));

  // Log the result
  log('Consolidated full character result:', result);

  // Save the result to a file
  const date = new Date().toISOString().replace(/:/g, '-');
  logToFile(`${date}_consolidated_full_character.json`, JSON.stringify(result, null, 2));

  return result;
};

const readFileFromZip = async (zip, fileName) => {
  log(`Reading file from zip: ${fileName}`);
  try {
    const buffer = await zip.entryData(fileName);
    const content = buffer.toString('utf8');
    log(`Successfully read ${fileName}`);
    return content;
  } catch (error) {
    logError(`Error reading file ${fileName} from zip:`, error);
    throw error;
  }
};

process.on('uncaughtException', (error) => {
  logError('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logError('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

program
  .option('--openai <api_key>', 'OpenAI API key')
  .option('--claude <api_key>', 'Claude API key')
  .parse(process.argv);

let archivePath = program.args[0];

if (!archivePath) {
  archivePath = await promptUser('Please provide the path to your Twitter archive zip file: ');
}

const generateCharacterJson = async (archivePath, qualityLevel, model) => {
  log(`Starting character generation from archive: ${archivePath}`);
  const zip = new StreamZip.async({ file: archivePath });

  console.log("zip", zip)

  try {
    log('Reading account data...');
    const accountData = JSON.parse((await readFileFromZip(zip, 'data/account.js')).replace('window.YTD.account.part0 = ', ''));
    log('Account data:', accountData);

    log('Reading tweets...');
    const tweets = JSON.parse((await readFileFromZip(zip, 'data/tweets.js')).replace('window.YTD.tweets.part0 = ', ''))
      .map((item) => item.tweet)
      .filter((tweet) => !tweet.retweeted);
    log(`Parsed ${tweets.length} tweets`);

    log('Reading direct messages...');
    const dms = JSON.parse((await readFileFromZip(zip, 'data/direct-messages.js')).replace('window.YTD.direct_messages.part0 = ', ''))
      .flatMap((item) => item.dmConversation.messages)
      .map((message) => message.messageCreate);
    log(`Parsed ${dms.length} direct messages`);

    const chunks = await chunkText(tweets, dms, accountData, archivePath);

    const results = await extractInfoFromChunks(accountData, chunks, archivePath, qualityLevel, model);

    const combined = combineAndDeduplicate(results);

    log('Writing full.character.json...');
    fs.writeFileSync('full.character.json', JSON.stringify(combined, null, 2));
    log('full.character.json generated successfully');



    const character = {
      name: accountData[0].account.accountDisplayName,
      ...combined,
    };

    log('Consolidating character information...');
    const fullCharacter = await consolidateCharacter(character, character.name);
    log('Consolidated full character information:', fullCharacter);

    log('Writing brief.character.json...');
    fs.writeFileSync('brief.character.json', JSON.stringify(fullCharacter, null, 2));
    log('brief.character.json generated successfully');


  } catch (error) {
    logError('Error generating character.json:', error);
  } finally {
    await zip.close();
  }
};


const limitConcurrency = async (tasks, concurrencyLimit) => {
  const results = [];
  const runningTasks = new Set();
  const queue = [...tasks];

  const runNext = async () => {
    if (queue.length === 0) return;
    const task = queue.shift();
    runningTasks.add(task);
    try {
      results.push(await task());
    } catch (error) {
      results.push(null);
      logError('Error in concurrent task:', error);
    } finally {
      runningTasks.delete(task);
      await runNext();
    }
  };

  const initialTasks = Array(Math.min(concurrencyLimit, tasks.length))
    .fill()
    .map(() => runNext());

  await Promise.all(initialTasks);
  await Promise.all(Array.from(runningTasks));

  return results;
};

const saveApiKey = (model, apiKey) => {
  const envConfig = dotenv.parse(fs.readFileSync(envPath));
  envConfig[`${model.toUpperCase()}_API_KEY`] = apiKey;
  fs.writeFileSync(envPath, Object.entries(envConfig).map(([key, value]) => `${key}=${value}`).join('\n'));
};

const loadApiKey = (model) => {
  const envConfig = dotenv.parse(fs.readFileSync(envPath));
  return envConfig[`${model.toUpperCase()}_API_KEY`];
};

const getApiKey = async (model) => {
  const envKey = process.env[`${model.toUpperCase()}_API_KEY`];
  if (validateApiKey(envKey, model)) return envKey;
  
  const cachedKey = loadApiKey(model);
  if (validateApiKey(cachedKey, model)) return cachedKey;
  
  let newKey = '';
  while (!validateApiKey(newKey, model)) {
    newKey = await promptForApiKey(model);
  }
  saveApiKey(model, newKey);
  return newKey;
};

const validateApiKey = (apiKey, model) => {
  if (!apiKey) return false;
  
  if (model === 'openai') {
    return apiKey.trim().startsWith('sk-');
  } else if (model === 'claude') {
    return apiKey.trim().length > 0;
  }
  return true; // For open-source model, any non-empty string is valid
};

const promptForApiKey = async (model) => {
  return await promptUser(`Enter ${model.toUpperCase()} API key: `);
};


const resumeOrStartNewSession = async (projectCache, archivePath) => {
  if (projectCache.unfinishedSession) {
    const choice = await promptUser(
      'An unfinished session was found. Continue? (Y/n): ',
      'Y'
    );
    if (choice.toLowerCase() !== 'y') {
      projectCache.unfinishedSession = null;
      clearGenerationCache(archivePath);
    }
  }
  
  if (!projectCache.unfinishedSession) {
    projectCache.model = await promptUser('Select model (openai/claude/open-source): ');
    projectCache.qualityLevel = await promptUser('Select quality (fast/quality): ');
    projectCache.basicUserInfo = await promptUser('Enter additional user info: ');
    
    projectCache.unfinishedSession = {
      currentChunk: 0,
      totalChunks: 0,
      completed: false
    };
  }
  
  return projectCache;
};

const safeExecute = async (func, errorMessage) => {
  try {
    return await func();
  } catch (error) {
    logError(errorMessage, error);
    throw error;
  }
};

const updateProgress = (progressBar, projectCache, archivePath) => {
  progressBar.update(projectCache.unfinishedSession.currentChunk);
  saveProjectCache(archivePath, projectCache);
};

const main = async () => {
  try {
    let archivePath = program.args[0];
    if (!archivePath) {
      archivePath = await promptUser('Please provide the path to your Twitter archive zip file: ');
    }

    let projectCache = loadProjectCache(archivePath) || {};
    
    projectCache = await resumeOrStartNewSession(projectCache, archivePath);
    
    if (projectCache.model !== 'open-source') {
      const apiKey = await getApiKey(projectCache.model);
      if (!apiKey) {
        throw new Error(`Failed to get a valid API key for ${projectCache.model}`);
      }
      process.env[`${projectCache.model.toUpperCase()}_API_KEY`] = apiKey;
    }
    
    saveProjectCache(archivePath, projectCache);

    const progressBar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);
    progressBar.start(projectCache.unfinishedSession.totalChunks || 100, projectCache.unfinishedSession.currentChunk || 0);

    const generatedCharacter = await safeExecute(async () => {
      const zip = new StreamZip.async({ file: archivePath });

      try {
        log('Reading account data...');
        const accountData = JSON.parse((await readFileFromZip(zip, 'data/account.js')).replace('window.YTD.account.part0 = ', ''));
        log('Account data:', accountData);

        log('Reading tweets...');
        const tweets = JSON.parse((await readFileFromZip(zip, 'data/tweets.js')).replace('window.YTD.tweets.part0 = ', ''))
          .map((item) => item.tweet)
          .filter((tweet) => !tweet.retweeted);
        log(`Parsed ${tweets.length} tweets`);

        log('Reading direct messages...');
        const dms = JSON.parse((await readFileFromZip(zip, 'data/direct-messages.js')).replace('window.YTD.direct_messages.part0 = ', ''))
          .flatMap((item) => item.dmConversation.messages)
          .map((message) => message.messageCreate);
        log(`Parsed ${dms.length} direct messages`);

        const chunks = await chunkText(tweets, dms, accountData, archivePath);
        projectCache.unfinishedSession.totalChunks = chunks.length;
        progressBar.setTotal(chunks.length);

        const results = [];
        for (let i = projectCache.unfinishedSession.currentChunk; i < chunks.length; i++) {
          const result = await extractInfo(accountData, chunks[i], i, archivePath, projectCache.qualityLevel, projectCache.model);
          results.push(result);
          projectCache.unfinishedSession.currentChunk = i + 1;
          updateProgress(progressBar, projectCache, archivePath);
        }

        const combined = combineAndDeduplicate(results);

        log('Writing full.character.json...');
        fs.writeFileSync('full.character.json', JSON.stringify(combined, null, 2));
        log('full.character.json generated successfully');

        const character = {
          name: accountData[0].account.accountDisplayName,
          ...combined,
        };

        log('Consolidating character information...');
        const fullCharacter = await consolidateCharacter(character, character.name, projectCache.model);
        log('Consolidated full character information:', fullCharacter);

        log('Writing brief.character.json...');
        fs.writeFileSync('brief.character.json', JSON.stringify(fullCharacter, null, 2));
        log('brief.character.json generated successfully');

        return fullCharacter;
      } finally {
        await zip.close();
      }
    }, 'Error generating character JSON');

    progressBar.stop();

    projectCache.unfinishedSession.completed = true;
    saveProjectCache(archivePath, projectCache);

    clearGenerationCache(archivePath);

    log('Script execution completed successfully.');
    log('Generated character:', generatedCharacter);
  } catch (error) {
    logError('Error during script execution:', error);
    process.exit(1);
  }
};

main();