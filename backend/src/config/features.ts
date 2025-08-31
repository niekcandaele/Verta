/**
 * Feature flags configuration
 * Runtime control of processing features
 */

export interface FeatureFlags {
  questionClustering: {
    enabled: boolean;
    autoProcessNewThreads: boolean;
    minThreadAgeDays: number;
    minConfidenceThreshold: number;
    clusteringSimilarityThreshold: number;
  };
  analysis: {
    enabledTenants: string[]; // List of tenant slugs where analysis is enabled
    maxThreadsPerJob: number;
    enableProgressTracking: boolean;
  };
}

/**
 * Get feature flags from environment or defaults
 */
export function getFeatureFlags(): FeatureFlags {
  return {
    questionClustering: {
      enabled: process.env.FEATURE_QUESTION_CLUSTERING !== 'false',
      autoProcessNewThreads:
        process.env.FEATURE_AUTO_PROCESS_THREADS === 'true',
      minThreadAgeDays: parseInt(
        process.env.FEATURE_MIN_THREAD_AGE_DAYS || '5'
      ),
      minConfidenceThreshold: parseFloat(
        process.env.FEATURE_MIN_CONFIDENCE || '0.7'
      ),
      clusteringSimilarityThreshold: parseFloat(
        process.env.FEATURE_CLUSTERING_THRESHOLD || '0.85'
      ),
    },
    analysis: {
      enabledTenants: process.env.FEATURE_ENABLED_TENANTS
        ? process.env.FEATURE_ENABLED_TENANTS.split(',').map((s) => s.trim())
        : [], // Empty array means all tenants enabled
      maxThreadsPerJob: parseInt(
        process.env.FEATURE_MAX_THREADS_PER_JOB || '1000'
      ),
      enableProgressTracking: process.env.FEATURE_PROGRESS_TRACKING !== 'false',
    },
  };
}

/**
 * Check if a feature is enabled for a tenant
 */
export function isFeatureEnabledForTenant(
  tenantSlug: string,
  feature: keyof FeatureFlags
): boolean {
  const flags = getFeatureFlags();

  // Check main feature toggle
  if (feature === 'questionClustering' && !flags.questionClustering.enabled) {
    return false;
  }

  // Check tenant-specific allowlist
  const enabledTenants = flags.analysis.enabledTenants;
  if (enabledTenants.length > 0 && !enabledTenants.includes(tenantSlug)) {
    return false;
  }

  return true;
}

/**
 * Get feature flag value
 */
export function getFeatureFlag<T extends keyof FeatureFlags>(
  feature: T
): FeatureFlags[T] {
  const flags = getFeatureFlags();
  return flags[feature];
}

// Export singleton instance
export const featureFlags = getFeatureFlags();
