// This file contains the fixed version of createLanguageModel function
// Only showing the corrected sections - integrate into existing file

import { LanguageModelV1 } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenRouter } from '@ai-sdk/openrouter';

// Add type definitions
interface Model {
  id: string;
  provider: string;
  features: { isFree: boolean };
  name?: string;
}

interface Provider {
  id: string;
  name: string;
  envKey: string;
}

interface UserConfig {
  model: string;
  apiKeys?: Record<string, string>;
}

export function createLanguageModel(config?: UserConfig): LanguageModelV1 {
  // Helper functions
  function getModelById(id: string): Model | undefined {
    const ALL_MODELS: Model[] = []; // Import or define your models
    return ALL_MODELS.find(m => m.id === id);
  }

  function getProviderById(id: string): Provider | undefined {
    const PROVIDERS: Provider[] = []; // Import or define your providers
    return PROVIDERS.find(p => p.id === id);
  }

  // Default config for free users
  if (!config) {
    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) {
      throw new Error('OPENAI_API_KEY environment variable is not set');
    }
    return createOpenAI({ apiKey: openaiKey })('gpt-4-mini') as LanguageModelV1;
  }

  const { model: modelId, apiKeys } = config;
  const modelData = getModelById(modelId);
  
  if (!modelData) {
    throw new Error(`Unknown model: ${modelId}`);
  }

  const provider = getProviderById(modelData.provider);
  if (!provider) {
    throw new Error(`Unknown provider for model ${modelId}: ${modelData.provider}`);
  }

  // Check for free model or OpenRouter model
  if (modelData.features.isFree || modelData.id.includes('/')) {
    const openRouterKey = process.env.OPENROUTER_API_KEY;
    if (!openRouterKey) {
      throw new Error('OPENROUTER_API_KEY is not configured for OpenRouter models');
    }
    return createOpenRouter({
      apiKey: openRouterKey,
      baseURL: 'https://openrouter.ai/api/v1',
      headers: {
        'HTTP-Referer': process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000',
        'X-Title': 'ResumeLM'
      }
    })(modelData.id) as LanguageModelV1;
  }

  // User needs to provide API key for premium models
  const userProvidedKey = apiKeys?.[provider.id];
  const envKey = process.env[provider.envKey];
  const finalKey = userProvidedKey || envKey;

  if (!finalKey) {
    throw new Error(`${provider.name} API key not provided. Set ${provider.envKey} environment variable or provide it in config.apiKeys`);
  }

  // Create client based on provider
  switch (provider.id) {
    case 'anthropic':
      return createAnthropic({ apiKey: finalKey })(modelData.id) as LanguageModelV1;
    case 'openai':
      return createOpenAI({ apiKey: finalKey, compatibility: 'strict' })(modelData.id) as LanguageModelV1;
    case 'openrouter':
      return createOpenRouter({
        apiKey: finalKey,
        baseURL: 'https://openrouter.ai/api/v1',
        headers: {
          'HTTP-Referer': process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000',
          'X-Title': 'ResumeLM'
        }
      })(modelData.id) as LanguageModelV1;
    default:
      throw new Error(`Unsupported provider: ${provider.id}`);
  }
}