import { createServerFn } from "@tanstack/react-start";

type Turn = { role: "user" | "assistant"; content: string };

const SYSTEM = `You are Aurion, a calm personal command intelligence.
Voice: precise, dry, lightly formal. Address the operator as "sir" only occasionally, never every sentence.
Keep replies to 2–4 short sentences unless asked for detail. No markdown headings, no bullet walls, no emoji.
You are not a Marvel character and you never claim to be JARVIS, Tony Stark's AI, or any fictional franchise AI.
You can help with briefings, planning, calculations, explanations, and conversation.
If you don't know a live fact (weather, news, the user's location), say so plainly instead of inventing it.`;

export const askAurion = createServerFn({ method: "POST" })
  .validator((input: { messages: Turn[] }) => {
    if (!input || !Array.isArray(input.messages) || input.messages.length === 0) {
      throw new Error("Say something first.");
    }
    const messages = input.messages.slice(-8).map((m) => {
      const role = m.role === "assistant" ? "assistant" : "user";
      const content = String(m.content ?? "").slice(0, 1500).trim();
      if (!content) throw new Error("Empty message.");
      return { role, content } as Turn;
    });
    return { messages };
  })
  .handler(async ({ data }) => {
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) {
      return { ok: false as const, error: "The link to the language core is offline." };
    }

    const res = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "grok-4.5",
        max_tokens: 280,
        temperature: 0.6,
        messages: [{ role: "system", content: SYSTEM }, ...data.messages],
      }),
    });

    if (!res.ok) {
      return { ok: false as const, error: `Core returned ${res.status}. Try again.` };
    }

    const body = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = body.choices?.[0]?.message?.content?.trim() ?? "";
    if (!text) return { ok: false as const, error: "No reply came back." };
    return { ok: true as const, text };
  });
