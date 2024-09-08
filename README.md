# tweets2character

Convert your twitter archive into a .character file which you can use with [Eliza](https://github.com/lalalune/eliza) or other LLM agents.

First, download your Twitter archive here: https://help.x.com/en/managing-your-account/how-to-download-your-x-archive

You can run tweets2character directly from your command line with no downloads:
```
npx tweets2character
```

Note: you will need node.js installed. The easiest way is with [nvm](https://github.com/nvm-sh/nvm).

Then clone this repo and run these commands:
```
npm install
node tweets2character.js twitter-2024-07-22-aed6e84e05e7976f87480bc36686bd0fdfb3c96818c2eff2cebc4820477f4da3.zip // path to your zip archive
```
