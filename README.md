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
- `@modelcontextprotocol/sdk` 1.26.0
- Zod 3
- Salesforce Marketing Cloud REST API
- Salesforce Marketing Cloud SOAP API
- Vercel
- GitHub

### Compatibilidade ICA

A versão 0.5.0 remove o adaptador intermediário `mcp-handler` do endpoint `/mcp` e usa diretamente o `WebStandardStreamableHTTPServerTransport` do SDK oficial MCP.

O endpoint trabalha em modo:

- Streamable HTTP
- stateless
- `enableJsonResponse=true`
- resposta `application/json`
- normalização do header `Accept` para compatibilidade com clientes que não enviam simultaneamente `application/json` e `text/event-stream`

O objetivo desta alteração é eliminar a camada que estava participando do erro de interoperabilidade observado no ICA (`content: Field required`) e deixar o contrato ICA -> MCP o mais direto possível.

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

- `ica_echo` — teste simples ICA -> MCP. O argumento `content` é opcional propositalmente: se o ICA perder o payload, a ferramenta retorna `ICA_ECHO_ARGUMENT_NOT_RECEIVED` em vez de falhar na validação de schema.
- `mcp_ping` — valida ICA -> Bluewolf MCP Gateway.
- `sfmc_configuration_status` — valida presença das configurações sem revelar credenciais.
- `sfmc_health` — realiza autenticação Server-to-Server real no SFMC.

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

### Journey Key

O endpoint oficial `POST /interaction/v1/interactions` do Journey Builder utiliza uma chave GUID/UUID. A ferramenta agora:

- aceita `key` opcional;
- mantém a chave recebida quando ela já é UUID válida;
- gera UUID automaticamente quando `key` não é enviada ou quando o valor informado é apenas uma referência amigável como `POC_SABESP_FATURA_30_60_DRAFT`;
- devolve `salesforceJourneyKey` no dry-run para auditoria e eventual reutilização na execução autorizada.

## Contrato MCP para ICA

O resultado de ferramenta mantém o contrato MCP básico:

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

Na camada HTTP, a versão 0.5.0 força resposta JSON para reduzir ambiguidades de parsing entre ICA/ContextForge e o servidor MCP.

## Configuração no IBM Consulting Advantage

Em **Browse Tools -> Developer Mode -> Add New -> External MCP Server**:

- MCP Server Name: `SFMC - Bluewolf Gateway Oficial`
- MCP Server URL: `https://bluewolf-martech-mcp.vercel.app/mcp`
- Transport Type: `STREAMABLE HTTP`
- Authentication Type: `Bearer Token`
- Token: usar exatamente o mesmo valor configurado em `MCP_GATEWAY_TOKEN` no Vercel
- Passthrough Headers: deixar vazio inicialmente
- Certificates: deixar vazio, salvo exigência corporativa específica

Depois do deploy, o servidor cadastrado no ICA não precisa ser recriado se URL e token permanecerem os mesmos. Atualize/reabra o catálogo apenas se o ICA mantiver cache antigo de ferramentas.

## Sequência obrigatória de testes no ICA

Não testar criação de Journey antes dos testes 1 a 5 passarem.

### Teste 1 — interoperabilidade básica

```text
Execute exclusivamente a ferramenta ica_echo com content="TESTE_ICA_BLUEWOLF_001".
Não execute nenhuma outra ferramenta.
Mostre exatamente o resultado retornado.
```

Resultado esperado:

`TESTE_ICA_BLUEWOLF_001`

Se retornar `ICA_ECHO_ARGUMENT_NOT_RECEIVED`, o MCP respondeu corretamente, mas o ICA não encaminhou o argumento.

### Teste 2 — conectividade MCP

```text
Execute exclusivamente mcp_ping.
Mostre exatamente o resultado retornado pela ferramenta.
Não utilize conhecimento próprio.
```

Resultado esperado: `status: ok`, `gateway: bluewolf-martech-mcp` e `responseMode: json`.

### Teste 3 — configuração SFMC

```text
Execute exclusivamente sfmc_configuration_status.
Informe apenas quais configurações estão presentes ou ausentes.
Não revele Client Secret, token ou qualquer credencial.
```

### Teste 4 — autenticação real SFMC

```text
Execute exclusivamente sfmc_health.
Valide a autenticação Server-to-Server real com o Salesforce Marketing Cloud.
Não revele credenciais nem access token.
```

### Teste 5 — leitura real

```text
Execute exclusivamente sfmc_list_data_extensions com limit=10.
Retorne somente informações realmente recebidas da ferramenta.
Não invente nomes, Customer Keys ou identificadores.
```

### Teste 6 — dry-run de Journey

```text
Execute exclusivamente sfmc_create_journey_draft com:
name="POC SABESP - Journey Draft Teste"
key="POC_SABESP_DRAFT_TESTE"
description="Teste técnico ICA + Bluewolf MCP + SFMC. Não publicar e não ativar."
approved=false
dryRun=true
approvalReference="POC-ICA-SFMC-001"

Mostre exatamente o payload proposto e a salesforceJourneyKey gerada.
Não faça nenhuma escrita real.
```

### Teste 7 — criação real de draft

Somente depois de Testes 1 a 6 passarem e existir autorização explícita:

```text
Execute exclusivamente sfmc_create_journey_draft com os mesmos dados aprovados,
approved=true,
dryRun=false,
approvalReference="POC-ICA-SFMC-001".

Crie somente o draft.
Não publique.
Não ative.
```

## Agent recomendado no ICA

Nome:

`SABESP MarTech Journey Factory - Salesforce Marketing Cloud`

Summary:

`Assistente MarTech da SABESP integrado ao Salesforce Marketing Cloud por meio do Bluewolf MCP Gateway, responsável por apoiar a esteira de criação de campanhas e jornadas: briefing, validação técnica, análise de dados, consulta ao ambiente SFMC, desenho da estratégia, geração de blueprint, definição de automações, validação de Data Extensions, governança, aprovação e criação controlada de drafts no Journey Builder.`

Welcome Message:

`Olá! Sou o SABESP MarTech Journey Factory, integrado ao Salesforce Marketing Cloud através do Bluewolf MCP Gateway. Posso consultar o ambiente real, validar Journeys, Data Extensions e Automations, estruturar briefings, gerar blueprints e preparar drafts controlados para revisão. Nenhuma publicação ou ativação é realizada automaticamente.`

Instructions sugeridas:

```text
Você é o SABESP MarTech Journey Factory, assistente técnico e estratégico do Programa CRM Salesforce SABESP.

Use prioritariamente as ferramentas do servidor SFMC - Bluewolf Gateway Oficial.

Regras obrigatórias:
1. Nunca invente dados, objetos, Data Extensions, Journeys, Automations, Customer Keys, IDs ou resultados do Salesforce Marketing Cloud.
2. Para diagnóstico, siga a ordem: ica_echo, mcp_ping, sfmc_configuration_status e sfmc_health.
3. Para contexto real, utilize martech_context_snapshot e as ferramentas sfmc_list_* / sfmc_get_*.
4. Diferencie claramente DADO REAL CONSULTADO, INFORMAÇÃO DO BRIEFING e SUGESTÃO DA IA.
5. Antes de propor uma nova jornada, entenda objetivo, público, oferta, canais, critérios de entrada e saída, regras de negócio, dados necessários, KPIs, solicitante e aprovadores.
6. Utilize martech_generate_blueprint para estruturar a estratégia de ponta a ponta.
7. Utilize martech_validate_briefing antes de qualquer proposta de construção.
8. Não afirme que Data Cloud está conectado se a ferramenta indicar apenas extension point.
9. Nunca revele Client Secret, Bearer Token, access token ou qualquer credencial.
10. Nunca publique ou ative uma Journey automaticamente.
11. sfmc_create_journey_draft deve permanecer em dryRun=true até existir aprovação explícita.
12. Escrita real exige approved=true, dryRun=false e approvalReference válido.
13. Sempre explique qual ferramenta foi executada e utilize somente o resultado realmente retornado.
14. Em caso de erro de ferramenta, mostre a mensagem técnica recebida e não substitua por dados inventados.
15. Se uma ferramenta de diagnóstico falhar, não avance para uma ferramenta de escrita.
16. Responda em português do Brasil, salvo solicitação em contrário.
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

Para validar o estado atual, use sempre:

1. o commit mais recente da branch `main`;
2. GitHub Actions com conclusão `success`;
3. status Vercel do mesmo commit como `Deployment has completed` / `success`;
4. `/health` retornando a versão esperada.

## Segurança

- Não exponha `MCP_GATEWAY_TOKEN` em screenshots, README, Issues ou commits.
- Se um token for compartilhado em texto ou imagem, rotacione-o no Vercel e atualize o mesmo valor no ICA.
- Mantenha credenciais SFMC somente em Environment Variables do Vercel.
- Para POC, mantenha o write scope estritamente governado e com aprovação humana.
- Antes de produção definitiva, revisar allowlist de operações, logging, rotação de segredos e modelo de autorização.
