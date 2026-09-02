/**
 * 渝游智策（Yuyouzhice）TypeScript 领域契约定义
 * 严格与 Java Spring AI 后端及 Node Web BFF 契约保持 100% 对齐
 */

export type RoutePreference = 'walking' | 'transit' | 'driving';

export interface GeoCoordinate {
  longitude: number;
  latitude: number;
}

export interface Citation {
  title: string;
  endpoint: string;
  note?: string;
  confidence?: number;
}

export interface MapContext {
  coordinates: [number, number]; // [经度, 纬度]
  address: string;
  district: string;
  recommendedTransport: string;
  polyline?: Array<[number, number]>;
}

export interface FactItem {
  label: string;
  value: string;
  status: '确定' | '未知' | '动态' | '冲突' | string;
  note?: string;
}

export interface Stop {
  id: string;
  venueId: string;
  stableStopId?: string;
  name: string;
  time?: string;
  duration?: string;
  durationMinutes?: number;
  arrivalTime?: string;
  departureTime?: string;
  routePreference: RoutePreference;
  recommendationReason: string;
  summary?: string;
  district?: string;
  ticket?: string;
  walk?: string;
  tone?: string;
  icon?: string;
  location?: string;
  mapContext?: MapContext;
  citations?: Citation[];
  facts?: FactItem[];
  image?: string;
  imageStatus?: 'READY' | 'DEGRADED' | 'FALLBACK' | string;
  imageReason?: string;
  imageSource?: string;
  routeFromPrevious?: {
    selectedMode?: string;
    selected?: { summary: string };
  };
}

export interface DayRoute {
  day: number;
  date: string;
  dateLabel?: string;
  weatherSummary?: string;
  weather?: {
    status?: string;
    value?: string;
    note?: string;
  };
  departureContext?: string;
  theme?: string;
  totalDistanceMeters?: number;
  totalDurationMinutes?: number;
  stops: Stop[];
  polyline?: Array<[number, number]>;
}

export interface TripConstraints {
  duration?: string;
  companions?: string;
  pace?: string;
  stayArea?: string;
  transportPreference?: string;
  dietPreference?: string;
  interests?: string[];
  arrivalAt?: string;
  departureAt?: string;
  walkingTolerance?: string;
  budget?: string;
  [key: string]: unknown;
}

export interface QualityMetrics {
  constraintSatisfaction?: {
    score: number;
    satisfied?: string[] | number;
    violated?: string[];
  };
  unknownFactCount?: number;
  dataCoverage?: {
    overall: number;
    weather?: number;
    poi?: number;
    routes?: number;
  };
  avgConstraintSatisfaction?: number | null;
  avgDataCoverage?: number | null;
  unknownFacts?: number;
  available?: boolean;
}

export interface SourceStatus {
  citationCoverage: number;
  mode: 'VECTOR_HYBRID' | 'FALLBACK_LOCAL' | string;
  provider?: string;
  poiResolved?: number;
  routeResolved?: number;
}

export interface PlanContext {
  startingArea?: string;
  routePreference?: string;
  foodGuidance?: string;
  routeStrategy?: string;
  budgetStrategy?: string;
}

export interface TripPlan {
  id?: string;
  sessionId: string;
  version: number;
  title: string;
  subtitle?: string;
  summary?: string;
  prompt?: string;
  input?: string;
  sourceMode?: string;
  constraints: TripConstraints;
  planContext?: PlanContext;
  sourceStatus?: SourceStatus;
  retrieval?: {
    mode: string;
    query?: string;
    topMatches?: number;
    facts?: FactItem[];
    citations?: Citation[];
  };
  qualityMetrics?: QualityMetrics;
  days: DayRoute[];
  plannerVersion?: string;
  policyVersion?: string;
  routeDataStatus?: string;
  explanationSource?: string;
  degraded?: boolean;
  degradationReasons?: string[];
  savedTripId?: string;
}

export interface UserPreferences {
  duration: string;
  companions: string;
  pace: string;
  transport: string;
  dining: Set<string>;
  themes: Set<string>;
}

export interface User {
  id: string;
  name?: string;
  email: string;
  role: 'user' | 'admin';
  deviceCount?: number;
  preferences?: string[];
  savedTrips?: number;
  createdAt?: string;
}

export interface ChatProposalCandidate {
  optionId?: string;
  venueId?: string;
  name: string;
  district?: string;
  walkDifficulty?: string;
  summary?: string;
  targetDay?: number;
  targetStopId?: string;
}

export interface ChatProposal {
  proposalId?: string;
  id?: string;
  baseRevision?: number;
  feasible?: boolean;
  type?: 'REPLACE_STOP' | 'ADJUST_TIME' | 'CHANGE_ROUTE' | string;
  description?: string;
  summary?: string;
  message?: string;
  reason?: string;
  reasonCodes?: string[];
  alternatives?: string[];
  candidateReplacements?: ChatProposalCandidate[];
  candidate?: ChatProposalCandidate;
  requiresConfirmation?: boolean;
  changedSegments?: string[];
  applied?: boolean;
  trip?: TripPlan;
  currentVersion?: number;
}

export interface ChatMeta {
  model?: string;
  generation?: {
    provider?: string;
    model?: string;
    status?: string;
  };
  retrieval?: {
    status?: string;
    source?: string;
    reason?: string;
    citations?: Citation[];
  };
  citations?: Citation[];
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  pending?: boolean;
  meta?: ChatMeta;
  sentiment?: string;
  error?: string;
}

export interface AmapConfig {
  key?: string;
  securityJsCode?: string;
  keyConfigured: boolean;
  mode: string;
}

export interface ExploreItem {
  id: string;
  name: string;
  district: string;
  category: string;
  ticket: string;
  summary: string;
  fit: string;
  tags: string[];
}

export interface SavedTripRecord {
  id: string;
  savedAt: string;
  trip: TripPlan;
}

export interface HistorySessionRecord {
  id: string;
  title: string;
  prompt: string;
  version: number;
  createdAt: string;
  replanHistory?: unknown[];
}

export interface KnowledgeDocument {
  docId: string;
  entityId?: string;
  entityName: string;
  title: string;
  topic: string;
  content: string;
  reviewStatus?: string;
}

export interface AdminOverview {
  metrics?: {
    travelers: number;
  };
  users?: User[];
  qualityMetrics?: QualityMetrics;
  rerankCache?: {
    l1MemoryHits: number;
    l2RedisHits: number;
    l3ModelCalls: number;
    avgLatencyMs: number;
  };
  knowledge?: {
    corpus?: {
      documents: number;
      entities: number;
    };
    sourceRegister?: Array<{
      publisher?: string;
      title: string;
      url?: string;
    }>;
  };
}
