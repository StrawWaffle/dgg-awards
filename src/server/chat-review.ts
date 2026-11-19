// The year in DGG chat: built into src/archive/chat-<year>.json by
// scripts/build-chat-review.py, then edited by admins on the page itself.
// The first save copies the document into the `pages` table; from then on
// that copy is the page, so rebuilding the file can't overwrite anyone's
// writing.
import chat2026 from "@/archive/chat-2026.json";
import { getPage, setPage } from "@/lib/data/driver";

export type ChatReviewDoc = Record<string, unknown>;

const built: Record<string, ChatReviewDoc> = { "2026": chat2026 };

export const chatReviewKey = (year: string) => `chat-${year}`;
export const chatReviewYears = () => Object.keys(built);

/** The page as it stands: the saved copy, or the built file until someone saves. */
export async function getChatReview(year: string): Promise<ChatReviewDoc | null> {
  return (await getPage(chatReviewKey(year))) ?? built[year] ?? null;
}

export const saveChatReview = (year: string, data: ChatReviewDoc) => setPage(chatReviewKey(year), data);
