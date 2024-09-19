# characterfile

The goal of this project is to create a simple, easy-to-use format for generating and transmitting character files. You can use these character files out of the box with [Eliza](https://github.com/lalalune/eliza) or other LLM agents.

## Schema

The JSON schema for the character file is [here](schema/character.schema.json). This also matches the expected format for [OpenAI function calling](https://platform.openai.com/docs/guides/function-calling).

## Examples

### Example Character file
Basic example of a character file, with values that are instructional
[examples/example.character.json](examples/example.character.json)

### Basic Python Example
Read the example character file and print the contents
[examples/example.py](examples/example.py)

### Python Validation Example
Read the example character file and validate it against the JSON schema
[examples/validate.py](examples/validate.py)

### Basic JavaScript Example
Read the example character file and print the contents
[examples/example.mjs](examples/example.mjs)

### JavScript Validation Example
Read the example character file and validate it against the JSON schema
[examples/validate.mjs](examples/validate.mjs)

# Scripts

You can use the scripts the generate a character file from your tweets, convert a folder of documents into a knowledge file, and add knowledge to your character file.

Most of these scripts require an OpenAI or Anthropic API key.

## tweets2character

Convert your twitter archive into a .character.json

First, download your Twitter archive here: https://help.x.com/en/managing-your-account/how-to-download-your-x-archive

You can run tweets2character directly from your command line with no downloads:

```sh
npx tweets2character
```

Note: you will need node.js installed. The easiest way is with [nvm](https://github.com/nvm-sh/nvm).

Then clone this repo and run these commands:

```sh
npm install
node scripts/tweets2character.js twitter-2024-07-22-aed6e84e05e7976f87480bc36686bd0fdfb3c96818c2eff2cebc4820477f4da3.zip # path to your zip archive
```

Note that the arguments are optional and will be prompted for if not provided.

## folder2knowledge

Convert a folder of images and videos into a .knowledge file which you can use with [Eliza](https://github.com/lalalune/eliza). Will convert text, markdown and PDF into chunked, searchable knowledge.

You can run folder2knowledge directly from your command line with no downloads:

```sh
npx folder2knowledge <path/to/folder>
```

```sh
npm install
node scripts/folder2knowledge.js path/to/folder # path to your folder
```

Note that the arguments are optional and will be prompted for if not provided.

## knowledge2character

Add knowledge to your .character file from a generated knowledge.json file.

You can run knowledge2character directly from your command line with no downloads:

```sh
npx knowledge2character <path/to/character.character> <path/to/knowledge.knowledge>
```

```sh
npm install
node scripts/knowledge2character.js path/to/character.character path/to/knowledge.knowledge # path to your character file and knowledge file
```

Note that the arguments are optional and will be prompted for if not provided.

# License

The license is the MIT license, with slight modifications so that users are not required to include the full license in their own software. See [LICENSE](LICENSE) for more details.