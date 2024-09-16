# tweets2character

Convert your twitter archive into a .character file which you can use with [Eliza](https://github.com/lalalune/eliza) or other LLM agents.

## Important

This project requires an OpenAI or Claude API key.

## tweets2character

First, download your Twitter archive here: https://help.x.com/en/managing-your-account/how-to-download-your-x-archive

You can run tweets2character directly from your command line with no downloads:

```sh
npx tweets2character
```

Note: you will need node.js installed. The easiest way is with [nvm](https://github.com/nvm-sh/nvm).

Then clone this repo and run these commands:

```sh
npm install
node tweets2character.js twitter-2024-07-22-aed6e84e05e7976f87480bc36686bd0fdfb3c96818c2eff2cebc4820477f4da3.zip # path to your zip archive
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
node folder2knowledge.js path/to/folder # path to your folder
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
node knowledge2character.js path/to/character.character path/to/knowledge.knowledge # path to your character file and knowledge file
```

Note that the arguments are optional and will be prompted for if not provided.
