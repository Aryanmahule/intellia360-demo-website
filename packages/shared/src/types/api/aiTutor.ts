export interface AiTutorRequest {
  message: string;
  grade: string;
  lessonId?: string;
  lessonTitle?: string;
  topic?: string;
  conversationHistory?: Array<{ sender: "bot" | "user"; text: string }>;
}

export interface AiTutorResponse {
  success: boolean;
  answer: string;
  grade?: string;
  lessonId?: string;
  accessAllowed?: boolean;
  requiresPurchase?: boolean;
  /** Today's AI Tutor questions against the membership's daily limit (null: no limit). */
  quota?: { used: number; limit: number | null };
}
