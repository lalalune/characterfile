import fs from "fs";
import https from "https";
import {
  getLlama,
  LlamaJsonSchemaGrammar
} from "node-llama-cpp";
import path from "path";
import si from "systeminformation";
import { fileURLToPath } from "url";
import os from "os";

const tmpDir = path.join(os.homedir(), 'tmp', '.eliza');

const jsonSchemaGrammar = {
  type: "object",
  properties: {
    user: {
      type: "string",
    },
    content: {
      type: "string",
    },
  },
};

class LlamaService {
  static instance = null;
  llama;
  model;
  modelPath;
  grammar;
  ctx;
  sequence;
  modelUrl;

  messageQueue = [];
  isProcessing = false;
  modelInitialized = false;

  constructor() {
    this.llama = undefined;
    this.model = undefined;
    this.modelUrl =
      "https://huggingface.co/NousResearch/Hermes-3-Llama-3.1-8B-GGUF/resolve/main/Hermes-3-Llama-3.1-8B.Q8_0.gguf?download=true";
    const modelName = "model.gguf";
    console.log("modelName", modelName);
    // Store the model in the global .eliza directory
    this.modelPath = path.join(tmpDir, modelName);
    this.initializeModel();
  }


  static getInstance() {
    if (!LlamaService.instance) {
      LlamaService.instance = new LlamaService();
    }
    return LlamaService.instance;
  }

  async initializeModel() {
    try {
      await this.checkModel();
      console.log("Loading llama");

      const systemInfo = await si.graphics();
      const hasCUDA = systemInfo.controllers.some((controller) =>
        controller.vendor.toLowerCase().includes("nvidia"),
      );

      if (hasCUDA) {
        console.log("**** CUDA detected");
      } else {
        console.log("**** No CUDA detected - local response will be slow");
      }

      this.llama = await getLlama({
        gpu: "cuda",
      });
      console.log("Creating grammar");
      const grammar = new LlamaJsonSchemaGrammar(
        this.llama,
        jsonSchemaGrammar,
      );
      this.grammar = grammar;
      console.log("Loading model");
      console.log("this.modelPath", this.modelPath);

      this.model = await this.llama.loadModel({ modelPath: this.modelPath });
      console.log("Model GPU support", this.llama.getGpuDeviceNames());
      console.log("Creating context");
      this.ctx = await this.model.createContext({ contextSize: 8192 });
      this.sequence = this.ctx.getSequence();

      this.modelInitialized = true;
      this.processQueue();
    } catch (error) {
      console.error(
        "Model initialization failed. Deleting model and retrying...",
        error,
      );
      await this.deleteModel();
      await this.initializeModel();
    }
  }

  async checkModel() {
    console.log("Checking model");
    // Ensure the global .eliza directory exists
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }

    if (!fs.existsSync(this.modelPath)) {
      console.log("this.modelPath", this.modelPath);
      console.log("Model not found. Downloading...");

      await new Promise((resolve, reject) => {
        const file = fs.createWriteStream(this.modelPath);
        let downloadedSize = 0;

        const downloadModel = (url) => {
          https
            .get(url, (response) => {
              const isRedirect =
                response.statusCode >= 300 && response.statusCode < 400;
              if (isRedirect) {
                const redirectUrl = response.headers.location;
                if (redirectUrl) {
                  console.log("Following redirect to:", redirectUrl);
                  downloadModel(redirectUrl);
                  return;
                } else {
                  console.error("Redirect URL not found");
                  reject(new Error("Redirect URL not found"));
                  return;
                }
              }

              const totalSize = parseInt(
                response.headers["content-length"] ?? "0",
                10,
              );

              response.on("data", (chunk) => {
                downloadedSize += chunk.length;
                file.write(chunk);

                // Log progress
                const progress = ((downloadedSize / totalSize) * 100).toFixed(
                  2,
                );
                process.stdout.write(`Downloaded ${progress}%\r`);
              });

              response.on("end", () => {
                file.end();
                console.log("\nModel downloaded successfully.");
                resolve();
              });
            })
            .on("error", (err) => {
              fs.unlink(this.modelPath, () => {}); // Delete the file async
              console.error("Download failed:", err.message);
              reject(err);
            });
        };

        downloadModel(this.modelUrl);

        file.on("error", (err) => {
          fs.unlink(this.modelPath, () => {}); // Delete the file async
          console.error("File write error:", err.message);
          reject(err);
        });
      });
    } else {
      console.log("Model already exists in the global .eliza directory.");
    }
  }

  async deleteModel() {
    if (fs.existsSync(this.modelPath)) {
      fs.unlinkSync(this.modelPath);
      console.log("Model deleted from the global .eliza directory.");
    }
  }

  async queueMessageCompletion(
    context,
    temperature,
    stop,
    frequency_penalty,
    presence_penalty,
    max_tokens,
  ) {
    console.log("Queueing message completion");
    return new Promise((resolve, reject) => {
      this.messageQueue.push({
        context,
        temperature,
        stop,
        frequency_penalty,
        presence_penalty,
        max_tokens,
        useGrammar: true,
        resolve,
        reject,
      });
      this.processQueue();
    });
  }

  async queueTextCompletion(
    context,
    temperature,
    stop,
    frequency_penalty,
    presence_penalty,
    max_tokens,
  ) {
    console.log("Queueing text completion");
    return new Promise((resolve, reject) => {
      this.messageQueue.push({
        context,
        temperature,
        stop,
        frequency_penalty,
        presence_penalty,
        max_tokens,
        useGrammar: false,
        resolve,
        reject,
      });
      this.processQueue();
    });
  }

  async processQueue() {
    if (
      this.isProcessing ||
      this.messageQueue.length === 0 ||
      !this.modelInitialized
    ) {
      return;
    }

    this.isProcessing = true;

    while (this.messageQueue.length > 0) {
      const message = this.messageQueue.shift();
      if (message) {
        try {
          console.log("Processing message");
          const response = await this.getCompletionResponse(
            message.context,
            message.temperature,
            message.stop,
            message.frequency_penalty,
            message.presence_penalty,
            message.max_tokens,
            message.useGrammar,
          );
          message.resolve(response);
        } catch (error) {
          message.reject(error);
        }
      }
    }

    this.isProcessing = false;
  }

  async getCompletionResponse(
    context,
    temperature,
    stop,
    frequency_penalty,
    presence_penalty,
    max_tokens,
    useGrammar,
  ) {
    if (!this.sequence) {
      throw new Error("Model not initialized.");
    }

    const tokens = this.model.tokenize(context);

    const repeatPenalty = {
      penalty: 1.2,
      frequencyPenalty: frequency_penalty,
      presencePenalty: presence_penalty,
    };

    const responseTokens = [];
    console.log("Evaluating tokens");
    for await (const token of this.sequence.evaluate(tokens, {
      temperature: Number(temperature),
      repeatPenalty: repeatPenalty,
      grammarEvaluationState: useGrammar ? this.grammar : undefined,
      yieldEogToken: false,
    })) {
      const current = this.model.detokenize([...responseTokens, token]);
      if ([...stop].some((s) => current.includes(s))) {
        console.log("Stop sequence found");
        break;
      }

      responseTokens.push(token);
      process.stdout.write(this.model.detokenize([token]));
      if (useGrammar) {
        if (current.replaceAll("\n", "").includes("}```")) {
          console.log("JSON block found");
          break;
        }
      }
      if (responseTokens.length > max_tokens) {
        console.log("Max tokens reached");
        break;
      }
    }

    const response = this.model.detokenize(responseTokens);

    if (!response) {
      throw new Error("Response is undefined");
    }

    if (useGrammar) {
      // extract everything between ```json and ```
      let jsonString = response.match(/```json(.*?)```/s)?.[1].trim();
      if (!jsonString) {
        // try parsing response as JSON
        try {
          jsonString = JSON.stringify(JSON.parse(response));
          console.log("parsedResponse", jsonString);
        } catch {
          throw new Error("JSON string not found");
        }
      }
      try {
        const parsedResponse = JSON.parse(jsonString);
        if (!parsedResponse) {
          throw new Error("Parsed response is undefined");
        }
        console.log("AI: " + parsedResponse.content);
        await this.sequence.clearHistory();
        return parsedResponse;
      } catch (error) {
        console.error("Error parsing JSON:", error);
      }
    } else {
      console.log("AI: " + response);
      await this.sequence.clearHistory();
      return response;
    }
  }

  async getEmbeddingResponse(input) {
    if (!this.model) {
      throw new Error("Model not initialized. Call initialize() first.");
    }

    const embeddingContext = await this.model.createEmbeddingContext();
    const embedding = await embeddingContext.getEmbeddingFor(input);
    return embedding?.vector;
  }
}

export default LlamaService;
