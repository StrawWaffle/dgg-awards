import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import type {
  getAllUsers,
  getAllVotes,
  getConfig,
  getNominees,
  getUserVotes,
} from "@/lib/data/driver";
import type {
  categoriesTable,
  optionsTable,
  sessionsTable,
  usersTable,
  votesTable,
} from "@/lib/data/schema";

export namespace API {
  export type GET_Config = Awaited<ReturnType<typeof getConfig>>;
  export type GET_Me = Session & { name: string };
  export type GET_Nominees = Awaited<ReturnType<typeof getNominees>>;
  export type Get_UserVotes = Awaited<ReturnType<typeof getUserVotes>>;
  export type GET_AllVotes = Awaited<ReturnType<typeof getAllVotes>>;
  export type GET_AllUsers = Awaited<ReturnType<typeof getAllUsers>>;
  export type PATCH_CategoryRequest = Partial<
    InferSelectModel<typeof categoriesTable>
  > & { id: string };
  export type PATCH_NomineeRequest = Partial<
    InferInsertModel<typeof optionsTable>
  > & { id: string; categoryId: string };
  export type PATCH_AdminUserRequest = User["uid"];
}

export type User = InferSelectModel<typeof usersTable>;
export type Session = InferSelectModel<typeof sessionsTable>;
export type PublicSession = Pick<Session, "id" | "uid">;
export type Option = InferSelectModel<typeof optionsTable>;
export type Category = InferSelectModel<typeof categoriesTable>;
export type Awards = Category[];
export type ImportableData = (Category & {
  options: Omit<Option, "categoryId">[];
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

export type MeApiResponse = Session & { name: User["name"] };

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

export type ApiVoteSubmit = {
  category_id: string;
  nominee_id: string;
};

export type VoteEntry = {
  id: string;
  title: string;
  description: string;
  categoryId: string;
  url: string | null;
  imageId: string | null;
  videoId: string | null;
  renderType: "default" | "compact" | null;
  category: {
    id: string;
    title: string;
    description: string;
  };
  votes: {
    at: Date;
    uid: number;
    categoryId: string;
    optionId: string;
    sessionSnapshot: {
      uid: number;
      id: string;
      createdAt: Date;
      expiresAt: Date;
      ip: string;
      agent: string;
    };
  }[];
};

export type ResultsData = {
  categoryId: string;
  categoryTitle: string;
  categoryDescription: string;
  totalVotes: number;
  options: {
    id: string;
    title: string;
    count: number;
    percentage: number;
    isWinner: boolean;
    payload: Omit<VoteEntry, "category" | "votes">;
  }[];
}[];

export type TopPost = {
  title: string;
  url: string;
};
export type TopLinks = TopPost[];
