import { AIProvider } from './ai-provider.interface';
import { MockAIProvider } from './mock-ai-provider';
import { AnthropicProvider } from './anthropic-provider';
import { env } from '../../config';

export const aiProvider: AIProvider = env.AI_PROVIDER === 'anthropic' ? new AnthropicProvider() : new MockAIProvider();

export type { AIProvider, AIMessage, GenerateResponseInput, GenerateResponseResult } from './ai-provider.interface';
export { AIProviderError } from './ai-provider.interface';
