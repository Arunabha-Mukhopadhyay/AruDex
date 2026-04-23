import {
  BIRDEYE_API_KEY,
  BIRDEYE_BASE_URL,
  BIRDEYE_CHAIN,
  BIRDEYE_DISCOVERY_ENRICH_LIMIT,
  BIRDEYE_DISCOVERY_SELECTION_LIMIT,
  BIRDEYE_MAX_ABS_PRICE_CHANGE_24H,
  BIRDEYE_MIN_LIQUIDITY_USD,
  BIRDEYE_MIN_VOLUME_24H_USD,
  BIRDEYE_NEW_LISTING_LIMIT,
  BIRDEYE_TRENDING_LIMIT
} from './config.js';

const birdeyeHeaders = () => ({
  accept: 'application/json',
  'X-API-KEY': BIRDEYE_API_KEY,
  'x-chain': BIRDEYE_CHAIN
});

const toNumberOrNull = (value) => {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
};

const mergeSourceLabels = (...labels) => {
  const unique = Array.from(new Set(labels.filter(Boolean)));
  return unique.join('+');
};

export const isBirdeyeConfigured = () => Boolean(BIRDEYE_API_KEY);

const createBirdeyeUrl = (path, query = {}) => {
  const url = new URL(path, BIRDEYE_BASE_URL);
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, String(value));
    }
  });
  return url.toString();
};

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const BIRDEYE_MAX_RETRIES = 3;
const BIRDEYE_RETRY_BASE_MS = 1000; // 1s, 2s, 4s backoff

const birdeyeGet = async (path, query = {}) => {
  if (!isBirdeyeConfigured()) {
    throw new Error('BIRDEYE_API_KEY is missing');
  }

  const url = createBirdeyeUrl(path, query);

  for (let attempt = 0; attempt <= BIRDEYE_MAX_RETRIES; attempt++) {
    const response = await fetch(url, {
      method: 'GET',
      headers: birdeyeHeaders()
    });

    if (response.status === 429) {
      if (attempt < BIRDEYE_MAX_RETRIES) {
        const backoff = BIRDEYE_RETRY_BASE_MS * Math.pow(2, attempt);
        console.log(`Birdeye 429 on ${path}, retrying in ${backoff}ms (attempt ${attempt + 1}/${BIRDEYE_MAX_RETRIES})`);
        await delay(backoff);
        continue;
      }
    }

    if (!response.ok) {
      const responseBody = await response.text();
      throw new Error(`Birdeye request failed (${response.status}): ${responseBody}`);
    }

    const payload = await response.json();

    if (payload?.success === false) {
      throw new Error(payload?.message ?? 'Birdeye returned success=false');
    }

    return payload?.data ?? null;
  }
};

const normalizeTrendingToken = (token) => ({
  source: 'trending',
  address: token?.address,
  symbol: token?.symbol ?? null,
  name: token?.name ?? null,
  liquidityUsd: toNumberOrNull(token?.liquidity),
  volume24hUsd: toNumberOrNull(token?.volume24hUSD ?? token?.v24hUSD),
  priceChange24hPercent: toNumberOrNull(token?.price24hChangePercent ?? token?.v24hChangePercent),
  priceUsd: toNumberOrNull(token?.price),
  rank: toNumberOrNull(token?.rank)
});

const normalizeNewListingToken = (token) => ({
  source: 'new_listing',
  address: token?.address,
  symbol: token?.symbol ?? null,
  name: token?.name ?? null,
  liquidityUsd: toNumberOrNull(token?.liquidity),
  volume24hUsd: null,
  priceChange24hPercent: null,
  priceUsd: null,
  rank: null
});

const mergeWithOverview = (token, overview) => ({
  ...token,
  symbol: token.symbol ?? overview?.symbol ?? null,
  name: token.name ?? overview?.name ?? null,
  liquidityUsd: token.liquidityUsd ?? toNumberOrNull(overview?.liquidity),
  volume24hUsd: token.volume24hUsd ?? toNumberOrNull(overview?.v24hUSD ?? overview?.volume24hUSD),
  priceChange24hPercent:
    token.priceChange24hPercent ??
    toNumberOrNull(overview?.priceChange24hPercent ?? overview?.v24hChangePercent),
  priceUsd: token.priceUsd ?? toNumberOrNull(overview?.price)
});

const candidateScore = (token) => {
  const liquidity = token?.liquidityUsd ?? 0;
  const volume = token?.volume24hUsd ?? 0;
  const positiveMomentum = Math.max(token?.priceChange24hPercent ?? 0, 0);
  return (volume * 0.6) + (liquidity * 0.4) + (positiveMomentum * 1000);
};

const passesDiscoveryFilters = (token) => {
  const liquidity = token?.liquidityUsd ?? 0;
  const volume = token?.volume24hUsd ?? 0;
  const priceChange = token?.priceChange24hPercent;

  if (liquidity < BIRDEYE_MIN_LIQUIDITY_USD) {
    return false;
  }
  if (volume < BIRDEYE_MIN_VOLUME_24H_USD) {
    return false;
  }
  if (priceChange !== null && priceChange !== undefined && Math.abs(priceChange) > BIRDEYE_MAX_ABS_PRICE_CHANGE_24H) {
    return false;
  }
  return true;
};

const getTrendingTokens = async () => {
  const data = await birdeyeGet('/defi/token_trending', {
    sort_by: 'rank',
    interval: '24h',
    sort_type: 'asc',
    offset: 0,
    limit: BIRDEYE_TRENDING_LIMIT
  });

  return (data?.tokens ?? [])
    .map(normalizeTrendingToken)
    .filter((token) => Boolean(token.address));
};

const getNewListings = async () => {
  const data = await birdeyeGet('/defi/v2/tokens/new_listing', {
    time_to: Math.floor(Date.now() / 1000),
    limit: BIRDEYE_NEW_LISTING_LIMIT,
    meme_platform_enabled: false
  });

  return (data?.items ?? [])
    .map(normalizeNewListingToken)
    .filter((token) => Boolean(token.address));
};

const getTokenOverview = async (address) => {
  if (!address) {
    return null;
  }
  return birdeyeGet('/defi/token_overview', { address });
};

export const getTokenPriceFromBirdeye = async (address) => {
  if (!address) {
    return null;
  }

  const data = await birdeyeGet('/defi/price', {
    address,
    include_liquidity: true
  });

  const value = toNumberOrNull(data?.value);
  if (value === null) {
    return null;
  }

  return {
    address,
    value,
    updateUnixTime: data?.updateUnixTime ?? null,
    updateHumanTime: data?.updateHumanTime ?? null,
    liquidityUsd: toNumberOrNull(data?.liquidity),
    priceChange24h: toNumberOrNull(data?.priceChange24h)
  };
};

export const buildBirdeyeTokenDiscovery = async () => {
  if (!isBirdeyeConfigured()) {
    return {
      enabled: false,
      status: 'disabled',
      reason: 'BIRDEYE_API_KEY is not configured',
      chain: BIRDEYE_CHAIN,
      filters: {
        minLiquidityUsd: BIRDEYE_MIN_LIQUIDITY_USD,
        minVolume24hUsd: BIRDEYE_MIN_VOLUME_24H_USD,
        maxAbsPriceChange24h: BIRDEYE_MAX_ABS_PRICE_CHANGE_24H
      },
      selectedTokens: [],
      sampledTokens: []
    };
  }

  try {
    // Sequential calls to respect rate limits
    const trendingTokens = await getTrendingTokens();
    await delay(350);
    const newListingTokens = await getNewListings();

    const uniqueCandidates = new Map();

    [...trendingTokens, ...newListingTokens].forEach((token) => {
      const key = token.address.toLowerCase();
      const existing = uniqueCandidates.get(key);

      if (!existing) {
        uniqueCandidates.set(key, token);
        return;
      }

      uniqueCandidates.set(key, {
        ...existing,
        ...token,
        source: mergeSourceLabels(existing.source, token.source),
        liquidityUsd: existing.liquidityUsd ?? token.liquidityUsd,
        volume24hUsd: existing.volume24hUsd ?? token.volume24hUsd,
        priceChange24hPercent: existing.priceChange24hPercent ?? token.priceChange24hPercent,
        priceUsd: existing.priceUsd ?? token.priceUsd,
        rank: existing.rank ?? token.rank
      });
    });

    const sortedCandidates = Array.from(uniqueCandidates.values())
      .sort((a, b) => candidateScore(b) - candidateScore(a));

    const candidatesToEnrich = sortedCandidates.slice(0, BIRDEYE_DISCOVERY_ENRICH_LIMIT);

    // Enrich sequentially with spacing to avoid 429s
    const enrichedCandidates = [];
    for (const token of candidatesToEnrich) {
      try {
        await delay(350);
        const overview = await getTokenOverview(token.address);
        enrichedCandidates.push(mergeWithOverview(token, overview));
      } catch (error) {
        enrichedCandidates.push({
          ...token,
          overviewError: error.message
        });
      }
    }

    const selectedTokens = enrichedCandidates
      .filter(passesDiscoveryFilters)
      .sort((a, b) => candidateScore(b) - candidateScore(a))
      .slice(0, BIRDEYE_DISCOVERY_SELECTION_LIMIT);

    return {
      enabled: true,
      status: 'ok',
      chain: BIRDEYE_CHAIN,
      generatedAt: new Date().toISOString(),
      filters: {
        minLiquidityUsd: BIRDEYE_MIN_LIQUIDITY_USD,
        minVolume24hUsd: BIRDEYE_MIN_VOLUME_24H_USD,
        maxAbsPriceChange24h: BIRDEYE_MAX_ABS_PRICE_CHANGE_24H
      },
      counts: {
        trending: trendingTokens.length,
        newListings: newListingTokens.length,
        deduplicated: sortedCandidates.length,
        enriched: enrichedCandidates.length,
        selected: selectedTokens.length
      },
      selectedTokens,
      sampledTokens: enrichedCandidates.slice(0, 5)
    };
  } catch (error) {
    return {
      enabled: true,
      status: 'error',
      chain: BIRDEYE_CHAIN,
      reason: error.message,
      generatedAt: new Date().toISOString(),
      filters: {
        minLiquidityUsd: BIRDEYE_MIN_LIQUIDITY_USD,
        minVolume24hUsd: BIRDEYE_MIN_VOLUME_24H_USD,
        maxAbsPriceChange24h: BIRDEYE_MAX_ABS_PRICE_CHANGE_24H
      },
      selectedTokens: [],
      sampledTokens: []
    };
  }
};
