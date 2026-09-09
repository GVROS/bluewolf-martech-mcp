# Bluewolf MarTech Journey Factory

POC end-to-end de MarTech para integrar **IBM Consulting Advantage (ICA)** ao **Salesforce Marketing Cloud Engagement (SFMC)** por meio de um **MCP Gateway em Streamable HTTP**.

A solução não é somente um gerador de Journey ou SQL. A esteira cobre:

1. Demanda / intake
2. Briefing de Marketing
3. Discovery e contexto histórico
4. Validação de dados
5. Estratégia assistida por IA
6. Validação técnica IBM/MarTech
7. Aprovação de negócio
8. Draft controlado no SFMC
9. Ajustes e QA
10. Go-live autorizado
11. Medição e aprendizado

## Produção

- Aplicação: `https://bluewolf-martech-mcp.vercel.app`
- MCP Streamable HTTP: `https://bluewolf-martech-mcp.vercel.app/mcp`
- Health/configuração: `https://bluewolf-martech-mcp.vercel.app/health`
- Branch de produção: `main`

## Stack

- Next.js 16
- Node.js 20+
- `mcp-handler` 1.1.0
- `@modelcontextprotocol/sdk` 1.26.0
- Zod 3
- Salesforce Marketing Cloud REST API
- Salesforce Marketing Cloud SOAP API
- Vercel
- GitHub

> O SDK 1.26.0 está pinado para manter compatibilidade com `mcp-handler@1.1.0` e evitar o conflito de peer dependency que causou deployments vermelhos anteriores.

## Variáveis de ambiente

Configure todas no Vercel como **Secret**, no ambiente Production:

- `SFMC_CLIENT_ID`
- `SFMC_CLIENT_SECRET`
- `SFMC_ACCOUNT_ID`
- `SFMC_AUTH_BASE_URI`
- `SFMC_REST_BASE_URI`
- `SFMC_SOAP_BASE_URI`
- `MCP_GATEWAY_TOKEN`

Nunca grave valores reais no GitHub.

## Ferramentas MCP

### Diagnóstico e interoperabilidade

- `ica_echo` — teste simples ICA -> MCP com argumento `content`
- `mcp_ping` — valida ICA -> Bluewolf MCP Gateway
- `sfmc_configuration_status` — valida presença das configurações sem revelar credenciais
- `sfmc_health` — realiza autenticação Server-to-Server real no SFMC

### Contexto real do Marketing Cloud

- `sfmc_list_journeys`
- `sfmc_get_journey`
- `sfmc_list_data_extensions`
- `sfmc_get_data_extension_fields`
- `sfmc_list_automations`
- `martech_context_snapshot`

### Journey Factory

- `martech_capabilities`
- `martech_generate_blueprint`
- `martech_validate_briefing`
- `martech_data_cloud_readiness`

### Escrita controlada

- `sfmc_create_journey_draft`

A ferramenta de escrita trabalha em `dryRun=true` por padrão. Escrita real exige simultaneamente:

- `approved=true`
- `dryRun=false`
- `approvalReference` preenchido

Ela cria somente um **draft**; não publica nem ativa automaticamente.

## Contrato MCP para ICA

O endpoint `/mcp` usa o contrato MCP básico de máxima interoperabilidade:

```json
{
  "content": [
    {
      "type": "text",
      "text": "..."
    }
  ]
}
```

Resultados de ferramenta não dependem de `structuredContent`. Isso reduz incompatibilidades com camadas federadas/ContextForge e clientes MCP mais antigos.

## Configuração no IBM Consulting Advantage

Em **Browse Tools -> Developer Mode -> Add New -> External MCP Server**:

- MCP Server Name: `SFMC - Bluewolf Gateway`
- MCP Server URL: `https://bluewolf-martech-mcp.vercel.app/mcp`
- Transport Type: `STREAMABLE HTTP`
- Authentication Type: `Bearer Token`
- Token: usar exatamente o mesmo valor configurado em `MCP_GATEWAY_TOKEN` no Vercel
- Passthrough Headers: deixar vazio inicialmente
- Certificates: deixar vazio, salvo exigência corporativa específica

Depois de adicionar o servidor, confirme que as ferramentas aparecem no catálogo antes de criar o Agent.

## Sequência obrigatória de testes no ICA

### Teste 1 — interoperabilidade básica

Prompt:

```text
Execute obrigatoriamente a ferramenta ica_echo com o parâmetro content="teste-ica".
Mostre exatamente o conteúdo retornado pela ferramenta.
Não utilize conhecimento próprio.
```

Resultado esperado: `status: ok` e o mesmo conteúdo enviado.

### Teste 2 — conectividade MCP

```text
Execute obrigatoriamente mcp_ping e mostre exatamente o resultado retornado.
Não utilize conhecimento próprio.
```

### Teste 3 — configuração SFMC

```text
Execute obrigatoriamente sfmc_configuration_status.
Informe apenas quais configurações estão presentes ou ausentes.
Não revele Client Secret, token ou qualquer credencial.
```

### Teste 4 — autenticação real SFMC

```text
Execute obrigatoriamente sfmc_health.
Valide a autenticação Server-to-Server real com o Salesforce Marketing Cloud.
Não revele credenciais nem access token.
```

### Teste 5 — leitura real

```text
Execute obrigatoriamente sfmc_list_data_extensions com limit=10.
Retorne somente informações realmente recebidas da ferramenta.
Não invente nomes, Customer Keys ou identificadores.
```

## Agent recomendado no ICA

Nome:

`SABESP MarTech - Salesforce Marketing Cloud`

Summary:

`Assistente MarTech da SABESP para consultar contexto real do Salesforce Marketing Cloud, estruturar briefings, gerar estratégias e blueprints de jornadas e executar ações controladas por meio do Bluewolf MCP Gateway.`

Welcome Message:

`Olá! Sou o assistente MarTech da SABESP integrado ao Salesforce Marketing Cloud através do Bluewolf MCP Gateway. Posso consultar Journeys, Data Extensions, campos e Automations, validar o ambiente, estruturar briefings, gerar blueprints completos e preparar drafts controlados para revisão. Qual demanda você deseja trabalhar?`

Instructions sugeridas:

```text
Você é o assistente técnico MarTech do Programa CRM Salesforce SABESP.

Use prioritariamente as ferramentas do servidor Salesforce Marketing Cloud - Bluewolf Gateway.

Regras obrigatórias:
1. Nunca invente dados, objetos, Data Extensions, Journeys, Automations, Customer Keys, IDs ou resultados do Salesforce Marketing Cloud.
2. Para diagnóstico de conexão, execute mcp_ping, sfmc_configuration_status e sfmc_health conforme necessário.
3. Para contexto real, utilize martech_context_snapshot e as ferramentas sfmc_list_* / sfmc_get_*.
4. Antes de propor uma nova jornada, entenda objetivo, público, oferta, canais, critérios de entrada e saída, regras de negócio, dados necessários, KPIs, solicitante e aprovadores.
5. Utilize martech_generate_blueprint para estruturar a estratégia de ponta a ponta.
6. Utilize martech_validate_briefing antes de qualquer proposta de construção.
7. Diferencie claramente recomendação de IA, dado real consultado e decisão humana aprovada.
8. Não afirme que Data Cloud está conectado se a ferramenta indicar apenas extension point.
9. Nunca revele Client Secret, token, access token ou qualquer credencial.
10. Nunca publique ou ative uma Journey automaticamente.
11. sfmc_create_journey_draft deve permanecer em dryRun=true até existir aprovação explícita.
12. Escrita real exige approved=true, dryRun=false e approvalReference válido.
13. Sempre explique qual ferramenta foi executada e utilize somente o resultado realmente retornado.
14. Em caso de erro de ferramenta, mostre a mensagem técnica recebida e não substitua por dados inventados.
15. Responda em português do Brasil, salvo solicitação em contrário.
```

## Fluxo funcional alvo

```text
Marketing / SABESP
        |
        v
Demanda -> Briefing -> Público -> Estratégia -> Conteúdo -> Construção -> Medição -> Ativação
                      |                 |             |
                      v                 v             v
                 Data Cloud        Automation       SFMC
                      \               |             /
                       \--------------v------------/
                              Bluewolf MCP
                                  |
                                  v
                        IBM Consulting Advantage
```

## Sobre deployments vermelhos antigos

Deployments com status `Error` permanecem visíveis no histórico do Vercel. Eles não significam que a produção atual está quebrada.

Para validar o estado atual, use sempre o deployment mais recente da branch `main` marcado como **Production / Ready** e o status Vercel do commit mais recente no GitHub.

## Segurança

- Não exponha `MCP_GATEWAY_TOKEN` em screenshots, README, Issues ou commits.
- Se um token for compartilhado em texto ou imagem, rotacione-o no Vercel e atualize o mesmo valor no ICA.
- Mantenha credenciais SFMC somente em Environment Variables do Vercel.
- Para POC, mantenha o write scope estritamente governado e com aprovação humana.
- Antes de produção definitiva, revisar allowlist de operações, logging, rotação de segredos e modelo de autorização.
