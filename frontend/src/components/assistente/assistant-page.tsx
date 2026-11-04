"use client";
import * as React from "react";
import { useSearchParams } from "next/navigation";
import { AssistantChat } from "@/components/assistente/assistant-chat";
import { useOptionalAssistant } from "@/components/assistente/assistant-store";
import { QUESTION_PARAM } from "@/components/assistente/source-links";

/**
 * /assistente: the chat at full width. ?domanda= (a QUERY source) fills the
 * composer and is never sent by itself.
 */
export function AssistantPage() {
  const store = useOptionalAssistant();
  const question = useSearchParams().get(QUESTION_PARAM);
  const setDraft = store?.setDraft;

  React.useEffect(() => {
    if (question && setDraft) setDraft(question);
  }, [question, setDraft]);

  if (!store) return null;
  return <AssistantChat variant="page" />;
}
