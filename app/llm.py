"""
LLM service (OpenAI only).
Builds grounded prompts from retrieved chunks and generates answers.
"""

import os
import json
from typing import List
from openai import OpenAI
from dotenv import load_dotenv
load_dotenv()

# Initialize client once
client = OpenAI(
    base_url=os.getenv("LLM_BASE_URL", "http://localhost:11434/v1"),
    api_key=os.getenv("OPENAI_API_KEY", "ollama"),
)
LLM_MODEL = os.getenv("LLM_MODEL", "mistral:7b")


# ── Prompt builder ─────────────────────────────────────────────────────────────
def build_prompt(question: str, chunks: List[dict]) -> str:
    context_blocks = []

    for i, chunk in enumerate(chunks, 1):
        context_blocks.append(
            f"""[{i}]
          FILE: {chunk['filename']}
          SCORE: {chunk['score']}
          {chunk['text']}
          """
        )

    context = "\n\n---\n\n".join(context_blocks)

    return f"""
You are a retrieval assistant.

Answer the user's question using ONLY the provided context.

IMPORTANT RULES:
- Return ONLY valid JSON.
- Do NOT include markdown.
- Do NOT include explanations outside the JSON.
- If the answer is not found, return:
{{
  "answers": []
}}

Return format:
{{
  "answers": [
    {{
      "fact": "short factual statement",
      "sources": [
        {{
          "chunk": 1,
          "filename": "example.pdf"
        }}
      ]
    }}
  ]
}}

Requirements:
- Each distinct fact should be its own array item.
- Combine duplicate facts.
- Keep facts concise.
- A fact may reference multiple chunks if needed.
- Do not hallucinate.
- NEVER combine numeric facts.
- Each unique value must be its own fact.
- Do not summarize multiple charges into one sentence.
- A single fact may contain at most ONE numeric value.

CONTEXT:
{context}

QUESTION:
{question}
""".strip()


# ── OpenAI call ───────────────────────────────────────────────────────────────
def call_openai(prompt: str) -> str:
    response = client.chat.completions.create(
        model=LLM_MODEL,  # cheap + fast + strong for RAG
        response_format={"type": "json_object"},
        messages=[
            {"role": "user", "content": prompt}
        ],
        temperature=0.2,
    )
    print(response)
    return response.choices[0].message.content


# ── Public interface ───────────────────────────────────────────────────────────
def generate_answer(question: str, chunks: List[dict]) -> dict:
    prompt = build_prompt(question, chunks)
    raw = call_openai(prompt)

    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        # fallback safety
        return {
            "answers": [
                {
                    "fact": raw,
                    "sources": []
                }
            ]
        }