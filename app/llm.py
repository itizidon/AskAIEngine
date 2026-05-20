"""
LLM service (OpenAI only).
Builds grounded prompts from retrieved chunks and generates answers.
"""

import os
from typing import List
from openai import OpenAI
from dotenv import load_dotenv
load_dotenv()

# Initialize client once
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))


# ── Prompt builder ─────────────────────────────────────────────────────────────
def build_prompt(question: str, chunks: List[dict]) -> str:
    context_blocks = []

    for i, chunk in enumerate(chunks, 1):
        print(chunk)
        context_blocks.append(
            f"[{i}] FILE: {chunk['filename']}\n{chunk['text']}"
        )

    context = "\n\n---\n\n".join(context_blocks)

    return f"""
    You are a helpful assistant answering questions using ONLY the provided context.

    Rules:
    - If the answer is not in the context, say: "I couldn't find that in your documents."
    - Do NOT hallucinate.
    - When answering, reference sources using their number AND filename when helpful.

    Good example:
    "The RAM is manufactured by Corsair (see [1] RAM_Specs.pdf)."

    Bad example:
    "Source 1 says..."

    CONTEXT:
    {context}

    QUESTION:
    {question}

    ANSWER:
    """.strip()


# ── OpenAI call ───────────────────────────────────────────────────────────────
def call_openai(prompt: str) -> str:
    response = client.chat.completions.create(
        model="gpt-4o-mini",  # cheap + fast + strong for RAG
        messages=[
            {"role": "user", "content": prompt}
        ],
        temperature=0.2,
    )
    print(response)
    return response.choices[0].message.content


# ── Public interface ───────────────────────────────────────────────────────────
def generate_answer(question: str, chunks: List[dict]) -> str:
    prompt = build_prompt(question, chunks)
    return call_openai(prompt)