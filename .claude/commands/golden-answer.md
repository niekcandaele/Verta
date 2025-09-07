---
description: Generate a golden answer by searching docs first, then Verta
allowed-tools: WebFetch, WebSearch, Bash(curl:*), mcp__tidb__db_query, TodoWrite, Glob, Grep, Read
---

# Generate Golden Answer for: $ARGUMENTS

I'll help you create a golden answer for this question by searching the official documentation first, then falling back to Verta's search if needed.

<TodoWrite>
Create a todo list:
1. Search takaro docs (https://docs.takaro.io/) for relevant information
2. Search CSMM docs (https://docs.csmm.app/) for relevant information  
3. Search Verta for supplementary information if needed
4. Synthesize findings into a 1-2 paragraph golden answer
</TodoWrite>

## Step 1: Extract key search terms and variations
Based on the question "$ARGUMENTS", I'll search for:
- Main topic keywords from the question
- Common variations and related terms
- How-to phrases and configuration terms

## Step 2: Search Takaro Documentation

<WebSearch>
Search query: site:docs.takaro.io $ARGUMENTS
</WebSearch>

<WebFetch>
url: https://docs.takaro.io/
prompt: Search the documentation for information about: $ARGUMENTS. Look for guides, configuration options, API references, and troubleshooting information related to this topic.
</WebFetch>

## Step 3: Search CSMM Documentation

<WebSearch>
Search query: site:docs.csmm.app $ARGUMENTS
</WebSearch>

<WebFetch>
url: https://docs.csmm.app/
prompt: Search the documentation for information about: $ARGUMENTS. Look for setup guides, features, configurations, and common issues related to this topic.
</WebFetch>

## Step 4: Search with variations
Let me search with different phrasings to ensure comprehensive coverage:

<WebSearch>
Search for how-to guide: "how to" $ARGUMENTS site:docs.takaro.io OR site:docs.csmm.app
</WebSearch>

<WebSearch>
Search for configuration: configure OR setup OR install $ARGUMENTS site:docs.takaro.io OR site:docs.csmm.app
</WebSearch>

## Step 5: Search Verta (if documentation search was insufficient)

<Bash>
curl -X POST http://localhost:25000/api/v1/search \
  -H "Content-Type: application/json" \
  -H "X-Tenant-Slug: takaro" \
  -d '{"query": "$ARGUMENTS", "limit": 20}' \
  2>/dev/null | jq '.'
</Bash>

## Step 6: Check existing golden answers in database

<mcp__tidb__db_query>
SELECT ga.answer, qc.representative_text 
FROM golden_answers ga
JOIN question_clusters qc ON ga.cluster_id = qc.id
JOIN tenants t ON ga.tenant_id = t.id
WHERE t.slug = 'takaro'
AND (qc.representative_text LIKE '%$1%' OR ga.answer LIKE '%$1%')
LIMIT 5;
</mcp__tidb__db_query>

## Step 7: Synthesize Golden Answer

Based on my research, here's the golden answer:

**Golden Answer:**
[I'll synthesize the findings from the documentation and searches into a clear, concise 1-2 paragraph answer that:
- Directly addresses the question
- Provides accurate, actionable information
- References specific features or configurations when relevant
- Maintains consistency with existing documentation
- Is written in a helpful, professional tone]

## Metadata for Golden Answer:
- **Question**: $ARGUMENTS
- **Primary Source**: [Takaro Docs / CSMM Docs / Verta Search]
- **Confidence**: [High/Medium based on documentation coverage]
- **Key Topics**: [List main topics covered]

Remember to review and adjust the golden answer for accuracy and clarity before adding it to the database.