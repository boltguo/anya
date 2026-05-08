/**
 * @module config/defaults
 * @description Provides the type definitions and default fallback values for the application configuration.
 *
 * This configuration dictates core agent behavior, provider connections, allowed tools,
 * security limits, and various advanced orchestration parameters. Agent identity instructions
 * (like SOUL) are separate from this structural configuration.
 */

/**
 * Defines the complete shape of the application configuration.
 * @interface AnyaConfig
 */
export interface AnyaConfig {
  /** Optional JSON schema reference for editor validation. */
  $schema?: string;
  /** The configuration format version. */
  version: string;

  /** Settings for the primary Large Language Model provider. */
  provider: {
    /** The identifier of the specific model to use. */
    model: string;
    /** The absolute maximum output tokens allowed in a single generation. */
    max_tokens: number;
    /** The sampling temperature controlling generation randomness. */
    temperature: number;
    /** The maximum number of retries permitted for transient API errors. */
    max_retries: number;
  };

  /** Specific settings for Google's Gemini AI Studio provider. */
  gemini: {
    /** The API key used to authenticate requests to Gemini. */
    api_key: string;
    /** The model to employ specifically for multi-modal vision tasks. */
    vision_model: string;
  };

  /** Configuration detailing which tools are accessible to the agent and their specific parameters. */
  tools: {
    /** An array of tool name identifiers that the agent is permitted to invoke. */
    enabled: string[];
    /** Settings specific to the web search tool integration. */
    web_search: {
      /** The backend service to utilize (e.g., 'tavily'). */
      backend: string;
      /** The API key for the chosen web search backend. */
      api_key: string;
      /** The maximum number of search results to process. */
      max_results: number;
    };
  };

  /** Security and execution boundary configurations. */
  security: {
    /** A list of directory paths the agent is permitted to read or modify. */
    allowed_paths: string[];
    /** The strictness level for critical operations ('ask', 'deny', or 'allow'). */
    fence_mode: 'ask' | 'deny' | 'allow';
  };

  /** Telegram integration parameters. */
  telegram: {
    /** Toggles the activation of the Telegram bot listener. */
    enabled: boolean;
    /** The token assigned by the Telegram BotFather. */
    bot_token: string;
    /** An array of Telegram numeric User IDs allowed to interact with the bot. */
    allowed_user_ids: number[];
  };

  /** Scheduled execution and automated task settings. */
  cron: {
    /** Toggles the internal cron scheduler. */
    enabled: boolean;
    /** The interval in seconds at which the cron evaluator ticks. */
    tick_seconds: number;
    /** The time zone used for resolving time-based cron triggers. */
    timezone: string;
    /** The default platform to use for asynchronous notifications. */
    default_platform: string;
    /** The default chat/user ID to target for automated messages. */
    default_chat_id: string;
  };

  /** Speech-to-Text configuration settings. */
  stt: {
    /** API key for the Groq platform processing audio transcription. */
    groq_api_key: string;
    /** The identifier of the whisper model to employ. */
    model: string;
  };

  /** Text-to-Speech synthesis parameters. */
  tts: {
    /** The string identifier representing the voice characteristics. */
    voice: string;
    /** The desired prosody rate (e.g., '+0%'). */
    rate: string;
  };

  /** Azure Cognitive Services configuration (used for TTS and Pronunciation Assessment). */
  azure: {
    /** The subscription key for Azure Speech Services. */
    speech_key: string;
    /** The Azure region identifier where the resource is hosted. */
    speech_region: string;
  };

  /** User interface and terminal display preferences. */
  ui: {
    /** Toggles whether raw tool invocations and results are echoed to the console. */
    show_tool_calls: boolean;
  };

  /** Low-level orchestration, state management, and debugging parameters. */
  advanced: {
    /** The context window token limit before forced compression is engaged. */
    context_window: number;
    /** The ratio (0.0 to 1.0) of context window usage at which compression triggers. */
    compress_threshold: number;
    /** The maximum absolute number of messages kept in active memory. */
    max_history_messages: number;
    /** The logging verbosity level ('debug', 'info', 'warn', 'error'). */
    log_level: string;
    /** The maximum number of autonomous tool iterations allowed per single user query. */
    max_react_loops: number;
  };
}

/**
 * The default configuration object providing sensible fallback values.
 * Deeply merged with user-defined JSON and environment variables at runtime.
 * @constant {AnyaConfig}
 */
export const DEFAULT_CONFIG: AnyaConfig = {
  $schema: './config.schema.json',
  version: '0.4.0',

  provider: {
    model: 'gpt-5.4',
    max_tokens: 8192,
    temperature: 0.7,
    max_retries: 3,
  },

  gemini: {
    api_key: '',
    vision_model: 'gemini-3-flash-preview',
  },

  tools: {
    enabled: [
      'read_file', 'write_file', 'list_dir', 'web_search',
      'memory', 'skill_view', 'clarify',
      'tg_msg', 'tts', 'pron_assess', 'db', 'persist', 'cron'
    ],
    web_search: { backend: 'tavily', api_key: '', max_results: 5 },
  },

  security: { allowed_paths: ['~/.anya/'], fence_mode: 'deny' },
  telegram: { enabled: false, bot_token: '', allowed_user_ids: [] },
  cron: {
    enabled: false,
    tick_seconds: 60,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    default_platform: 'telegram',
    default_chat_id: '',
  },
  stt: { groq_api_key: '', model: 'whisper-large-v3-turbo' },
  tts: { voice: 'en-US-AriaNeural', rate: '+0%' },
  azure: { speech_key: '', speech_region: 'eastasia' },
  ui: { show_tool_calls: true },

  advanced: {
    context_window: 1000000,
    compress_threshold: 0.8,
    max_history_messages: 200,
    log_level: 'info',
    max_react_loops: 20,
  },
};
