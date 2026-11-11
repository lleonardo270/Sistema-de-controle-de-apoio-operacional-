# Apoio Voluntário – Sistema de Controle de Apoio Operacional e Ajuda de Custo

Aplicação web (funciona no celular e no computador) para a Família Colaboradora registrar plantões,
apurar a **ajuda de custo voluntária e indenizatória** (alimentação e transporte) e emitir
**extratos de repasse** e **recibos de apoio voluntário** em PDF.

## Funcionalidades (conforme o RDM)

| Requisito | Onde está |
|---|---|
| RF01 – Cadastro de profissionais (nome completo, chave Pix, COREN opcional, categoria Fixo ou Cobertura/Standby, modalidade Integral ou Apenas Transporte com aceite prévio) | aba **Profissionais** |
| RF02 – Registro manual de plantões (diurno ou noturno de 12h, ou 24 horas = 2 plantões de 12h), vários dias de uma vez pelo calendário, seleção múltipla para apagar e importação de planilha CSV | aba **Plantões** |
| RF03 – Cálculo automático: regra do 4º plantão fixo, retroativo do 1º ao 3º, R$ 30,00 ou R$ 10,00 por plantão; cobertura não conta | `js/calc.js` |
| RF04 – Extrato mensal detalhado por profissional | aba **Extratos** |
| RF05 – Recibo em PDF com texto de caráter voluntário e indenizatório, pronto para assinatura | Extratos → **Recibo (PDF)** |
| 2.4 – Fechamento do mês anterior e data limite no 5º dia útil (considera feriados nacionais) | aba **Início** |
| RNF01 – Terminologia de apoio voluntário (sem termos trabalhistas) | toda a interface |
| RNF02 – Termo de ciência no primeiro acesso e no cadastro de cada profissional (imprimível) | primeiro acesso / Profissionais → 📄 |
| RNF03 – Acesso protegido por senha | tela de entrada |

Extras: marcar repasse como pago (data e forma), alerta de atraso, resumo do mês em PDF, envio do extrato
por WhatsApp, backup/restauração e instalação como aplicativo no celular (PWA, funciona sem internet).

## Configuração única (uma família)

Esta instalação é de uso exclusivo de uma família. No **primeiro acesso** o app pede, uma única vez:
nome da família, nome do paciente, cidade e a senha. Depois disso
tudo pode ser ajustado em **Ajustes**, sem novo deploy.

Se quiser deixar esses dados já preenchidos no primeiro acesso, edite `js/config.js`
(também é ali que ficam os valores padrão de R$ 20,00 de alimentação e R$ 10,00 de transporte).

## Editar textos sem novo deploy

Em **Ajustes → Textos e termos** a família pode editar: o termo de ciência inicial, o termo do profissional,
o aceite da opção “Apenas Transporte”, o recibo, a declaração do extrato e o rodapé do WhatsApp.

- `**texto**` deixa em negrito; uma linha em branco começa novo parágrafo; linhas com `1.` ou `-` viram lista.
- Campos como `{profissional}`, `{pix}`, `{coren}`, `{valor}`, `{valor_extenso}`, `{mes}`, `{familia}` são preenchidos
  automaticamente (toque no campo para inseri-lo).
- Há pré-visualização com dados de exemplo e o botão **Restaurar padrão**.
- Os textos editados ficam salvos junto com os dados (e vão no backup).

## Como os dados são guardados (importante)

- **Não há servidor nem banco de dados.** Os dados ficam no navegador do aparelho, **criptografados
  (AES-256) com a senha da família**. Sem a senha não é possível ler nem recuperar os dados.
- Cada aparelho tem a sua própria cópia. Para usar em outro celular, faça **Ajustes → Exportar backup**
  e, no outro aparelho, escolha o arquivo em “Restaurar a partir de um backup” no primeiro acesso.
- Faça backup com frequência: limpar os dados do navegador apaga o sistema daquele aparelho.
  O arquivo de backup **não é criptografado** (contém nomes e chaves Pix) — guarde-o com cuidado.

## Publicar na Vercel

1. Em [vercel.com](https://vercel.com) → **Add New… → Project** → importe este repositório do GitHub.
2. Framework Preset: **Other**. Deixe *Build Command* e *Output Directory* vazios.
3. **Deploy**. Pronto: abra o endereço `https://…vercel.app` no celular.

Para instalar como aplicativo: no Android (Chrome) menu ⋮ → **Instalar app / Adicionar à tela inicial**;
no iPhone (Safari) botão Compartilhar → **Adicionar à Tela de Início**.

### Gerar PDFs pelo celular

Os botões de PDF abrem a janela de impressão do navegador:
- **Android/Chrome:** escolha a impressora **“Salvar como PDF”**.
- **iPhone/Safari:** na tela de impressão, use **Compartilhar → Salvar em Arquivos** (ou envie direto pelo WhatsApp).

## Importação de planilha

Salve a planilha como **CSV** com as colunas `Data;Turno;Profissional;Tipo` (Tipo é opcional):

```
Data;Turno;Profissional;Tipo
03/09/2026;Diurno;Maria Souza;Fixo
05/09/2026;Noturno;Maria Souza;
```

“Profissional” deve ser o nome completo como cadastrado (maiúsculas, acentos e espaços extras são ignorados).

## Desenvolvimento

Sem dependências e sem etapa de build (HTML + CSS + JavaScript puro).

```bash
npm run dev    # servidor local em http://localhost:5173
npm test       # testes das regras de cálculo (Node 18+)
```

Estrutura:

```
index.html            página única
css/style.css         layout responsivo (mobile-first) e layout de impressão/PDF
js/app.js             telas e interações
js/calc.js            regras de negócio (elegibilidade, retroativo, 5º dia útil, extenso, CSV)
js/store.js           armazenamento local criptografado
js/textos.js          textos padrão dos termos/recibos e o formatador dos textos editáveis
js/config.js          parâmetros da família usados no primeiro acesso
sw.js                 funcionamento offline
vercel.json           cabeçalhos de segurança
tests/                testes automatizados
```
