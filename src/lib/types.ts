import type { InferSelectModel } from "drizzle-orm";
import type { z } from "zod";
import type {
  categoriesTable,
  optionsTable,
  sessionsTable,
  usersTable,
  votesTable,
} from "@/lib/data/schema";
import type { RunoffResult, VotingStyle } from "@/lib/voting";
import type { nomineePatch } from "@/server/schemas";

// Request and response types for the HTTP API are not written here: requests
// come from the Zod schemas in src/server/schemas.ts, responses are inferred
// from the routes by the typed client (src/lib/client.ts, src/lib/queries.ts).
export namespace API {
  export type PATCH_NomineeRequest = z.infer<typeof nomineePatch>;
}

export type User = InferSelectModel<typeof usersTable>;
export type Session = InferSelectModel<typeof sessionsTable>;
export type PublicSession = Pick<Session, "id" | "uid">;
// As the API sends them: `position` only decides the order they come in.
export type Option = Omit<InferSelectModel<typeof optionsTable>, "position">;
export type Category = Omit<InferSelectModel<typeof categoriesTable>, "position" | "hidden">;
/** Nominee fields added after 2025; optional in data files and imports. */
export type NomineeDetails =
  | "date"
  | "linkType"
  | "clipStart"
  | "clipEnd"
  | "clipKey"
  | "clipStatus"
  | "clipError"
  | "thumbnailKey"
  | "thumbnailAt"
  | "emote";

export type ImportableData = (Omit<Category, "votingStyle"> &
  Partial<Pick<Category, "votingStyle">> & { hidden?: boolean } & {
  options: (Omit<Option, "categoryId" | NomineeDetails> &
    Partial<Pick<Option, NomineeDetails>>)[];
})[];
export type ViewingMode = "locked" | "voting" | "idle" | "reviewing";

export type DggOauthTokenRequest = {
  grant_type: "authorization_code";
  code: string;
  client_id: string;
  redirect_uri: string;
  code_verifier: string;
};

export type DggOauthTokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope: string;
  token_type: string;
};

export type DggApiUserinfoResponse = {
  nick: string;
  username: string;
  userId: number;
  status: string;
  createdDate: string;
  roles: string[];
  features: string[];
  subscription: null | unknown;
  activeBan: null | unknown;
  team: "PEPE" | "YEE";
  allowChatting: boolean;
  wikiUserId: number;
};

export interface StreamableFileMetadata {
  framerate: number;
  height: number;
  width: number;
  bitrate: number;
  size: number;
  duration: number;
}

export interface StreamableProcessedFile extends StreamableFileMetadata {
  status: number;
  url: string;
}

export interface StreamableFiles {
  mp4: StreamableProcessedFile;
  "mp4-mobile": StreamableProcessedFile;
  original: StreamableFileMetadata;
}

export interface StreamableVideo {
  status: number;
  percent: number;
  url: string;
  embed_code: string;
  message: string | null;
  files: StreamableFiles;
  thumbnail_url: string;
  title: string;
  source: string | null;
  audio_channels: number;
}

export interface YouTubeVideo {
  title: string;
  author_name: string;
  author_url: string;
  type: string;
  height: number;
  width: number;
  version: string;
  provider_name: string;
  provider_url: string;
  thumbnail_height: number;
  thumbnail_width: number;
  thumbnail_url: string;
  html: string;
}

export type Contribution = {
  user: string;
  description: string;
};

export type Recognitions = Contribution[];

export type Vote = InferSelectModel<typeof votesTable>;


/** A nominee with its category and votes, as the results query loads it. */
export type VoteEntry = InferSelectModel<typeof optionsTable> & {
  category: InferSelectModel<typeof categoriesTable>;
  votes: Vote[];
};

export type ResultsData = {
  categoryId: string;
  categoryTitle: string;
  categoryDescription: string;
  votingStyle: VotingStyle;
  /** Voters in this category. */
  totalVotes: number;
  /** Ranked categories only: the instant-runoff rounds and winner. */
  runoff?: RunoffResult;
  /**
   * Last place first. `count` is first choices. Points awards add `points`
   * (summed over ballots) and `placed` (ballots with them in their top 10),
   * `percentage` is their share of all points, and `totalVotes` is ballots.
   */
  options: {
    id: string;
    title: string;
    count: number;
    percentage: number;
    isWinner: boolean;
    points?: number;
    placed?: number;
    payload: Option;
  }[];
}[];

export type TopPost = {
  title: string;
  url: string;
};
export type TopLinks = TopPost[];
