// Simple example of reading in a character file and printing the contents

import fs from 'fs';

// Read the character JSON file
const characterData = JSON.parse(fs.readFileSync('examples/example.character.json', 'utf8'));

// Function to randomly select and combine elements from an array
function randomSelectAndCombine(arr, count) {
  const shuffled = arr.sort(() => 0.5 - Math.random());
  return shuffled.slice(0, Math.min(count, arr.length)).join(' ');
}

// Function to randomly select elements from an array
function randomSelect(arr, count) {
  const shuffled = arr.sort(() => 0.5 - Math.random());
  return shuffled.slice(0, Math.min(count, arr.length));
}

// Function to replace user placeholders with random names
function replaceUserPlaceholders(example) {
  const names = ['Alice', 'Bob', 'Charlie', 'Dick', 'Edward'];
  const userMapping = {};
  for (const message of example) {
    const placeholders = message.user.match(/\{\{user\d+\}\}/g);
    if (placeholders) {
      for (const placeholder of placeholders) {
        if (!userMapping[placeholder]) {
          userMapping[placeholder] = names[Math.floor(Math.random() * names.length)];
        }
        message.user = message.user.replace(placeholder, userMapping[placeholder]);
      }
    }
  }
  return example;
}

// Randomly select and combine bio lines
const bio = randomSelectAndCombine(characterData.bio, 3);

// Randomly select lore lines
const lore = randomSelect(characterData.lore, 3);

// Randomly select message examples
const messageExamples = characterData.messageExamples.sort(() => 0.5 - Math.random()).slice(0, Math.min(3, characterData.messageExamples.length));

// Replace user placeholders with random names
const updatedMessageExamples = messageExamples.map(example => replaceUserPlaceholders(example));

// Randomly select style directions
const allStyle = randomSelect(characterData.style.all, 3).join('\n');
const chatStyle = randomSelect(characterData.style.chat, 3).join('\n');
const postStyle = randomSelect(characterData.style.post, 3).join('\n');

// Print the selected values
console.log('Bio:', bio);
console.log('Lore:');
lore.forEach(entry => console.log('-', entry));
console.log('Message Examples:');
updatedMessageExamples.forEach((example, index) => {
  console.log(`Conversation ${index + 1}:`);
  example.forEach(message => {
    console.log(`${message.user}: ${message.content.text}`);
  });
  console.log('---');
});
console.log('All Style:');
console.log(allStyle);
console.log('Chat Style:');
console.log(chatStyle);
console.log('Post Style:');
console.log(postStyle);
console.log('Knowledge Items:', characterData.knowledge.length);