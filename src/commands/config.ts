import chalk from 'chalk';
import { loadConfig } from '../config/loader.js';
import { CONFIG_PATH, isInitialized } from '../lib/paths.js';

/**
 * `anya config show` -- Display current configuration with API keys masked.
 */
export function runConfigShow(): void {
  if (!isInitialized()) {
    console.log(chalk.yellow('~/.anya/ not initialized. Run "anya init" first.'));
    return;
  }

  const config = loadConfig();

  // Deep clone and mask sensitive values
  const display = JSON.parse(JSON.stringify(config));

  if (display.provider?.api_key) {
    display.provider.api_key = maskKey(display.provider.api_key);
  }
  if (display.tools?.web_search?.api_key) {
    display.tools.web_search.api_key = maskKey(display.tools.web_search.api_key);
  }
  if (display.telegram?.bot_token) {
    display.telegram.bot_token = maskKey(display.telegram.bot_token);
  }

  console.log(chalk.bold.cyan('\nAnya Configuration'));
  console.log(chalk.dim(`  ${CONFIG_PATH}\n`));
  console.log(JSON.stringify(display, null, 2));
  console.log();
}

function maskKey(key: string): string {
  if (key.length <= 8) return '****';
  return key.substring(0, 4) + '****' + key.substring(key.length - 4);
}
