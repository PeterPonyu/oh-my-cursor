# Context Recipe Library: Third-Party MCP Servers

This guide details how to integrate third-party Model Context Protocol (MCP) servers (Exa, Context7, Grep.app) into your Cursor workspace. 

By default, the `oh-my-cursor` (OMCS) backbone limits automatic installations to local state components to preserve security and telemetry boundaries. Users can manually opt-in and register these servers in their Cursor settings.

---

## 1. Exa (Semantic Web Search)

Exa provides a semantic search engine designed specifically for LLMs. It excels at finding high-quality documentation, blog posts, and codebase answers.

### Configuration
Add the following to your Cursor MCP settings (`Cursor Settings > Features > MCP > Add New MCP Server`):

- **Name**: `exa`
- **Type**: `command`
- **Command**:
  ```bash
  npx -y @exa/mcp-server
  ```
- **Environment Variables**:
  - `EXA_API_KEY`: `your_exa_api_key_here`

### Usage
Once registered, you can direct Cursor agents to search the web semantically:
- *Prompt Example*: `"Use Exa MCP to search for the latest Next.js 15 routing API updates."`

---

## 2. Context7 (Official Documentation Search)

Context7 allows searching and retrieving official API documentations directly from the IDE context.

### Configuration
Register the server in Cursor MCP:

- **Name**: `context7`
- **Type**: `command`
- **Command**:
  ```bash
  npx -y @context7/mcp-server
  ```
- **Environment Variables**:
  - `CONTEXT7_API_KEY`: `your_context7_api_key_here`

### Usage
Ask Cursor to retrieve official API specs or libraries:
- *Prompt Example*: `"Ask Context7 to retrieve the complete API specification for the Stripe Node.js SDK."`

---

## 3. Grep.app (GitHub Public Code Search)

Grep.app is a search engine for searching public code repositories on GitHub. It helps find usage patterns of libraries in real-world public projects.

### Configuration
Register the server in Cursor MCP:

- **Name**: `grep-app`
- **Type**: `command`
- **Command**:
  ```bash
  npx -y @grep-app/mcp-server
  ```

### Usage
Ask Cursor to find public code references or examples:
- *Prompt Example*: `"Search Grep.app for examples of React Server Components using experimental_useFormStatus."`

---

> [!NOTE]
> All third-party MCP servers are run client-side by Cursor. Ensure you review their privacy policies and API key usage terms.
