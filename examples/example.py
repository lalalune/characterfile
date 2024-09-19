# Simple example of reading in a character file and printing the contents

import json
import random
import re

# Read the character JSON file
with open('examples/example.character.json', 'r') as file:
    character_data = json.load(file)

# Function to randomly select and combine elements from an array
def random_select_and_combine(arr, count):
    shuffled = random.sample(arr, len(arr))
    return ' '.join(shuffled[:min(count, len(arr))])

# Function to randomly select elements from an array
def random_select(arr, count):
    shuffled = random.sample(arr, len(arr))
    return shuffled[:min(count, len(arr))]

# Function to replace user placeholders with random names
def replace_user_placeholders(example):
    names = ['Alice', 'Bob', 'Charlie', 'Dick', 'Edward']
    user_mapping = {}
    for message in example:
        for placeholder in re.findall(r'\{\{user\d+\}\}', message['user']):
            if placeholder not in user_mapping:
                user_mapping[placeholder] = random.choice(names)
            message['user'] = message['user'].replace(placeholder, user_mapping[placeholder])
    return example

# Randomly select and combine bio lines
bio = random_select_and_combine(character_data['bio'], 3)

# Randomly select and combine lore lines
lore = random_select_and_combine(character_data['lore'], 3).split(' ')

# Randomly select message examples
message_examples = random.sample(character_data['messageExamples'], min(3, len(character_data['messageExamples'])))

# Replace user placeholders with random names
message_examples = [replace_user_placeholders(example) for example in message_examples]

# Randomly select style directions
all_style = '\n'.join(random_select(character_data['style']['all'], 3))
chat_style = '\n'.join(random_select(character_data['style']['chat'], 3))
post_style = '\n'.join(random_select(character_data['style']['post'], 3))

# Print the selected values
print('Bio:', bio)
print('Lore:', lore)
print('Message Examples:')
for i, example in enumerate(message_examples, start=1):
    print(f'Conversation {i}:')
    for message in example:
        print(f"{message['user']}: {message['content']['text']}")
    print('---')
print('All Style:')
print(all_style)
print('Chat Style:')
print(chat_style)
print('Post Style:')
print(post_style)
print('Knowledge Items:', len(character_data['knowledge']))