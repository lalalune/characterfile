/**
 * Represents a UUID, which is a universally unique identifier conforming to the UUID standard.
 */
export type UUID = `${string}-${string}-${string}-${string}-${string}`;


/**
 * Represents a media object, such as an image, video, or other file, with various properties.
 */
export type Media = {
    id: string;
    url: string;
    title: string;
    source: string;
    description: string;
    text: string;
};

/**
 * Represents the content of a message, including its main text (`content`), any associated action (`action`), and the source of the content (`source`), if applicable.
 */
export interface Content {
    text: string; // The main text content of the message.
    action?: string; // An optional action associated with the message, indicating a specific behavior or response required.
    source?: string; // The source of the content, if applicable, such as a reference or origin.
    url?: string; // The actual URL of the message or post, i.e. tweet URL or message link in discord
    inReplyTo?: UUID; // If this is a message in a thread, or a reply, store this
    attachments?: Media[];
    [key: string]: unknown; // Allows for additional properties to be included dynamically.
}

/**
 * Represents an example of a message, typically used for demonstrating or testing purposes, including optional content and action.
 */
export interface MessageExample {
    user: string; // The user associated with the message example. If {{user1}}, {{user2}}, etc. will be replaced with random names
    content: Content; // The content of the message example, which may be null for actions that don't produce visible content.
}

/**
 * Represents a character, which can be used for an LLM agent.
 */
export type Character = {
    id?: UUID; // optional UUID which can be passed down to identify the character
    name: string;
    bio: string | string[];
    lore: string[];
    messageExamples: MessageExample[][];
    postExamples: string[];
    people: string[];
    topics: string[];
    adjectives: string[];
    clients: string[]; // list of clients the character can interact with
    settings?: {
        secrets?: { [key: string]: string };
        voice?: {
            model?: string;
            url?: string;
        };
        model?: string;
        embeddingModel?: string;
    };
    style: {
        all: string[];
        chat: string[];
        post: string[];
    };
};