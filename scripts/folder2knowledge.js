#!/usr/bin/env node

import { encoding_for_model } from 'tiktoken';
import pdf2md from '@opendocsg/pdf2md';
import crypto from 'crypto';
import dotenv from 'dotenv';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import readline from 'readline';

dotenv.config();

// The first argument from the command line is the starting path
const startingPath = process.argv[2];

const tmpDir = path.join(os.homedir(), 'tmp', '.eliza');
const envPath = path.join(tmpDir, '.env');

// Ensure the tmp directory and .env file exist
const ensureTmpDirAndEnv = async () => {
  await fs.mkdir(tmpDir, { recursive: true });
  if (!await fs.access(envPath).then(() => true).catch(() => false)) {
    await fs.writeFile(envPath, '');
  }
};

const saveApiKey = async (apiKey) => {
  const envConfig = dotenv.parse(await fs.readFile(envPath, 'utf-8'));
  envConfig.OPENAI_API_KEY = apiKey;
  await fs.writeFile(envPath, Object.entries(envConfig).map(([key, value]) => `${key}=${value}`).join('\n'));
};

const loadApiKey = async () => {
  const envConfig = dotenv.parse(await fs.readFile(envPath, 'utf-8'));
  return envConfig.OPENAI_API_KEY;
};

const validateApiKey = (apiKey) => {
  return apiKey && apiKey.trim().startsWith('sk-');
};

const promptForApiKey = () => {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question('Enter your OpenAI API key: ', (answer) => {
      rl.close();
      resolve(answer);
    });
  });
};

const getApiKey = async () => {
  // Check process.env first
  if (validateApiKey(process.env.OPENAI_API_KEY)) {
    return process.env.OPENAI_API_KEY;
  }

  // Check cache in tmpdir
  const cachedKey = await loadApiKey();
  if (validateApiKey(cachedKey)) {
    return cachedKey;
  }

  // Prompt user if no valid key found
  const newKey = await promptForApiKey();
  if (validateApiKey(newKey)) {
    await saveApiKey(newKey);
    return newKey;
  } else {
    console.error('Invalid API key provided. Exiting.');
    process.exit(1);
  }
};

const processDocument = async (filePath) => {
  console.log(`Processing file: ${filePath}`);

  let content;
  const fileExtension = path.extname(filePath).toLowerCase();

  if (fileExtension === '.pdf') {
    const buffer = await fs.readFile(filePath);
    const uint8Array = new Uint8Array(buffer);
    content = await pdf2md(uint8Array);
  } else {
    content = await fs.readFile(filePath, 'utf8');
  }

  // Generate a unique ID for the document based on its content
  const documentId = crypto.createHash('sha256').update(content).digest('hex');

  const document = {
    id: documentId,
    path: filePath,
    content: content
  };

  // Function to split content into chunks based on token count
  const splitContent = (content) => {
    const chunks = [];
    const enc = encoding_for_model('text-embedding-ada-002');
    const tokens = enc.encode(content);
    
    let currentChunk = [];

    for (const token of tokens) {
      currentChunk.push(token);
      if (currentChunk.length >= 1000) {
        chunks.push(new TextDecoder().decode(enc.decode(currentChunk)));
        currentChunk = [];
      }
    }

    if (currentChunk.length > 0) {
      if (chunks.length > 0 && currentChunk.length < 500) {
        // If the last chunk is short, combine it with the previous chunk
        const lastChunk = new TextDecoder().decode(enc.decode(currentChunk));
        chunks[chunks.length - 1] += lastChunk;
      } else {
        chunks.push(new TextDecoder().decode(enc.decode(currentChunk)));
      }
    }

    enc.free();
    return chunks;
  };

  const chunks = splitContent(content);

  // Process each chunk
  const processedChunks = [];

  for (let index = 0; index < chunks.length; index++) {
    const chunk = chunks[index];
    console.log(`Embedding chunk ${index + 1}/${chunks.length}`);

    const chunkId = crypto.createHash('sha256').update(chunk).digest('hex');

    try {
      // Vectorize the chunk with OpenAI embeddings
      const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          input: chunk,
          model: 'text-embedding-ada-002',
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        console.error('API request failed:', data);
        throw new Error(`API request failed with status ${response.status}`);
      }

      if (!data.data || !data.data[0] || !data.data[0].embedding) {
        console.error('Unexpected API response structure:', data);
        throw new Error('Unexpected API response structure');
      }

      const embedding = data.data[0].embedding;

      processedChunks.push({
        id: chunkId,
        documentId: documentId,
        content: chunk,
        embedding: embedding
      });
    } catch (error) {
      console.error(`Error processing chunk ${index + 1}:`, error);
      throw error;
    }
  }

  console.log('All chunks processed.');

  return { document, chunks: processedChunks };
};

// Asynchronous function to recursively find files and process them
const findAndProcessFiles = async (dirPath) => {
  try {
    const filesAndDirectories = await fs.readdir(dirPath, {
      withFileTypes: true,
    });

    const documents = [];
    const chunks = [];

    for (const dirent of filesAndDirectories) {
      const fullPath = path.join(dirPath, dirent.name);

      if (dirent.isDirectory()) {
        const { docs, chks } = await findAndProcessFiles(fullPath);
        documents.push(...docs);
        chunks.push(...chks);
      } else if (dirent.isFile()) {
        const { document, chunks: fileChunks } = await processDocument(fullPath);
        documents.push(document);
        chunks.push(...fileChunks);
      }
    }

    return { docs: documents, chks: chunks };
  } catch (error) {
    console.error(`Error processing directory ${dirPath}: ${error}`);
    return { docs: [], chks: [] };
  }
};

const promptForPath = () => {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question('Please enter a starting path: ', (answer) => {
      rl.close();
      resolve(answer);
    });
  });
};

// Main function to kick off the script
const main = async () => {
  try {
    await ensureTmpDirAndEnv();
    const apiKey = await getApiKey();
    process.env.OPENAI_API_KEY = apiKey;

    let path = startingPath;

    if (!path) {
      path = await promptForPath();
    }

    if (!path) {
      console.log('No starting path provided. Exiting.');
      return;
    }

    console.log(`Searching for files in: ${path}`);
    const { docs, chks } = await findAndProcessFiles(path);

    const output = {
      documents: docs,
      chunks: chks
    };

    // Save the output to knowledge.json
    await fs.writeFile('knowledge.json', JSON.stringify(output, null, 2));

    console.log('Done processing files and saved memories to knowledge.json.');
  } catch (error) {
    console.error('Error during script execution:', error);
    process.exit(1);
  }
};

// Execute the main function
main();