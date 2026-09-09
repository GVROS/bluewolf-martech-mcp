# Bluewolf MarTech Journey Factory

POC end-to-end para conectar o **IBM Consulting Advantage (ICA)** ao **Salesforce Marketing Cloud Engagement (SFMC)** por MCP, com governança humana e um ponto de extensão explícito para **Salesforce Data Cloud**.

O objetivo não é apenas gerar SQL ou uma Journey. A aplicação modela a esteira completa de trabalho:

1. Demanda de Marketing
2. Briefing
3. Discovery e contexto histórico
4. Validação de dados
5. Estratégia assistida por IA
6. Validação técnica IBM/MarTech
7. Aprovação de negócio
8. Criação controlada de draft no SFMC
9. Ajustes manuais e QA
10. Publicação/monitoramento
11. Captura de aprendizado para próximas jornadas

## Arquitetura

```text
Marketing / Cliente
      |
      v
IBM Consulting Advantage
  - briefing
  - raciocínio/estratégia
  - agente
      |
      | MCP Streamable HTTP + Bearer Token
      v
Bluewolf MarTech MCP Gateway (Next.js / Vercel)
  - governança
  - contexto
  - blueprint
  - validação
  - ferramentas SFMC
      |
      +--------------------------+
      |                          |
      v                          v
Salesforce Marketing Cloud      Salesforce Data Cloud
  - Journeys                    - DLO / DMO
  - Data Extensions             - segmentação
  - Automations                 - identidade
  - draft controlado            - ativação
                               (conector separado / fase seguinte)
```

## Endpoints

- `/` — dashboard / demonstrador da Journey Factory
- `/api/blueprint` — gera blueprint técnico a partir de um briefing
- `/mcp` — MCP Streamable HTTP usado pelo ICA
- `/health` — status não sensível da aplicação e da configuração

## Ferramentas MCP

### Conectividade e diagnóstico

- `mcp_ping`
- `sfmc_configuration_status`
- `sfmc_health`

### Contexto real do Marketing Cloud

- `sfmc_list_journeys`
- `sfmc_get_journey`
- `sfmc_list_data_extensions`
- `sfmc_get_data_extension_fields`
- `sfmc_list_automations`
- `martech_context_snapshot`

### Esteira MarTech

- `martech_capabilities`
- `martech_validate_briefing`
- `martech_generate_blueprint`
- `martech_data_cloud_readiness`

### Escrita controlada

- `sfmc_create_journey_draft`

A ferramenta de escrita é **safe-by-default**:

- `dryRun=true` por padrão
- escrita real exige `approved=true`
- escrita real exige `dryRun=false`
- escrita real exige `approvalReference`
- cria somente um **draft shell** no Journey Builder
- não publica e não ativa a jornada

## Fluxo recomendado no ICA

Use a sequência abaixo para uma nova demanda:

```text
mcp_ping
  -> sfmc_configuration_status
  -> sfmc_health
  -> martech_context_snapshot
  -> martech_validate_briefing
  -> martech_generate_blueprint
  -> revisão humana
  -> sfmc_create_journey_draft (dry-run)
  -> aprovação humana
  -> sfmc_create_journey_draft (write)
  -> QA / ajustes / publicação fora do write automático
```

## Contexto e aprendizado

O princípio da solução é que a IA não trabalha apenas com um prompt isolado. O ICA pode consultar objetos reais no Marketing Cloud antes de sugerir uma nova estratégia.

A próxima camada de evolução deve persistir e indexar também:

- briefs aprovados
- blueprints finais
- jornadas existentes e suas versões
- Data Extensions e campos usados
- queries e automações aprovadas
- resultados de campanha
- aprendizados de QA
- decisões técnicas registradas

Esse conjunto passa a funcionar como contexto para novas recomendações, reduzindo repetição e aumentando consistência.

## Salesforce Data Cloud

O Data Cloud é tratado como um conector separado do SFMC. Não reutilize Client ID/Secret do pacote instalado do Marketing Cloud Engagement para fingir uma conexão com Data Cloud.

A integração futura deve cobrir:

- autenticação Salesforce Platform/Data Cloud
- leitura de DLO/DMO
- relacionamentos e Data Graph quando necessário
- segmentos e critérios
- entidade/granularidade de ativação
- consentimento
- Identity Resolution somente quando o caso de uso exigir
- ativação dos atributos mínimos necessários para execução no SFMC

## Environment Variables

Configure no Vercel e nunca commite valores reais:

```text
SFMC_CLIENT_ID=
SFMC_CLIENT_SECRET=
SFMC_ACCOUNT_ID=
SFMC_AUTH_BASE_URI=
SFMC_REST_BASE_URI=
SFMC_SOAP_BASE_URI=
MCP_GATEWAY_TOKEN=
```

## ICA — cadastro do MCP

- Transport: `STREAMABLE HTTP`
- Authentication Type: `Bearer Token`
- MCP Server URL: `https://bluewolf-martech-mcp.vercel.app/mcp`
- Token: exatamente o mesmo valor de `MCP_GATEWAY_TOKEN` configurado no Vercel

Após alterações estruturais nas tools, remova e cadastre novamente o MCP no ICA para forçar nova descoberta de schemas.

## Permissões SFMC

O pacote Server-to-Server deve possuir somente os escopos necessários para a POC. O gateway nunca retorna Client Secret, access token ou credenciais.

A operação atual usa leitura de:

- Journeys
- Automations
- Data Extensions

E permite apenas a criação controlada de um **Journey draft**, sujeita aos gates de governança da ferramenta.

## Deployment

O projeto está conectado ao Vercel através da branch `main`.

Um commit em `main` aciona o deployment. Antes de considerar uma alteração concluída, confirme o status **Vercel = success** no commit final.

## Versão

Atual: `0.3.0`
