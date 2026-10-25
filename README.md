# Mika & Xan

> **Progressive Web App (PWA) Offline-First** para gestão de hospedagem domiciliar de cães, check-in inteligente de clientes recorrentes e controle administrativo em tempo real.

**Aplicação em Produção:** [https://mika-xan-pets.ai.studio/](https://mika-xan-pets.ai.studio/)  
**Autor:** Xan (`xampsdev`)

---

## O Problema e a Solução

Antes deste projeto, o processo de pré-check-in dos cães hospedados em casa dependia de formulários terceirizados estáticos (`forms.app`) que enviavam respostas avulsas por e-mail. Isso gerava três gargalos operacionais:
1. **Retrabalho para clientes recorrentes:** Tutores precisavam preencher todas as 22 perguntas novamente a cada nova estadia.
2. **Falta de acesso offline rápido:** Consultar restrições alimentares, protocolos de alergia ou medicações exigia buscar e-mails antigos com conexão ativa.
3. **Ausência de fotos padronizadas e notas internas por ficha:** Não havia como anexar fotos pela câmera diretamente no perfil do cão ou registrar observações privadas de comportamento pós-hospedagem.

O **Mika & Xan PWA** resolve esse fluxo unificando o formulário público inteligente e o painel administrativo seguro em uma única aplicação instalável (Android e iOS) com sincronização local via **IndexedDB**.

---

## Funcionalidades Principais

### Fluxo Público do Cliente (Check-in Inteligente e Mobile-First)
* **Busca Automática por Telefone (DDD):** Identifica tutores já cadastrados instantaneamente.
* **Auto-Preenchimento de Retorno:** Clientes recorrentes selecionam seu pet cadastrado, revisam as 22 informações de saúde e rotina em etapas organizadas e agendam um novo check-in em segundos.
* **Agendamento Anti-Ghost Click (Android/iOS):** Etapa final dedicada com seletores nativos de data e horário de entrada/saída e trava de transição de toque (`stepTransitionLock`), evitando submissões acidentais em telas mobile.
* **Compressão de Imagem Client-Side:** Fotos enviadas pelos tutores são redimensionadas e convertidas via HTML5 Canvas (`DataURL/WebP`) no próprio navegador, garantindo envio instantâneo (< 1s).

### Painel Administrativo Offline-First e Zero-Trust
* **Autenticação Blindada (Session-Only e Rate Limit):** Login administrativo sem exposição de credenciais pré-preenchidas, com encerramento automático de sessão ao sair da aba (`inMemoryPersistence`), bloqueio temporário após tentativas falhas e validação estrita via `firestore.rules`.
* **Sincronização Offline Nativa (`persistentLocalCache`):** Leitura e atualização de fichas funcionam mesmo sem internet, com indicador visual de status de sincronização em tempo real (`onSnapshot`).
* **Anotações Internas Privadas (Pós-Aprovação):** Isolamento arquitetural de dados sensíveis na coleção restrita `pet_admin_notes` e diário por estadia (`adminStayNotes`), permitindo ao administrador registrar comportamentos do cão após aprovar a hospedagem sem expor essas notas no auto-preenchimento público do tutor.
* **Gestão Completa e Exclusão em Cascata:** Captura de foto fallback pela câmera do celular, destaque visual para alertas médicos/alergias e exclusão em cascata (removendo ficha do pet, histórico de estadias e notas internas).
* **Notificações Push 24/7 Cross-Platform:** Sistema híbrido combinando *Web Push Service Worker* (com gerador dinâmico de ícones PNG via Canvas para iOS Safari `standalone` e Android) e ponte de webhook em JSON puro via **ntfy.sh** para alertas imediatos com a tela bloqueada.

---

## UI/UX e Design System (Acessibilidade WCAG AAA)

A interface foi refatorada sob diretrizes estritas **Mobile-First** utilizando a paleta *Rose Quartz & Serenity* combinada com tipografia de alto contraste:
* **Paleta Principal:** `#f7cac9` (Rose Quartz), `#dec2cb` (Dusty Blush), `#c5b9cd` (Soft Lilac), `#abb1cf` (Periwinkle) e `#92a8d1` (Serenity Blue).
* **Contraste e Leitura (WCAG 2.1):** Pareamento de superfícies pastéis com texto em Azul-Noite Profundo (`#1E293B`), garantindo razão de contraste entre **6.09:1 e 9.92:1 (Nível AAA)** para leitura confortável sob luz solar.
* **Ergonomia de Toque:** Inputs e botões padronizados com altura mínima de `48px` e fonte `16px` (`text-base`) para eliminar o auto-zoom intrusivo do iOS Safari, além de modais em estilo *Bottom Sheet* nativo.

---

## Stack Tecnológica e Arquitetura

| Camada | Tecnologias Utilizadas | Papel na Arquitetura |
| :--- | :--- | :--- |
| **Frontend** | React 18, TypeScript, Vite | Componentização tipada das 22 variáveis clínicas/comportamentais do pet e build otimizado. |
| **Estilização e UI** | Tailwind CSS, Lucide Icons | Design System *Mobile-First* com navegação fixa inferior e cartões responsivos. |
| **Banco de Dados** | Firebase Cloud Firestore (SDK v10+) | Modelagem NoSQL relacional em 4 coleções (`tutors`, `pets`, `stays`, `pet_admin_notes`) com cache offline multi-abas. |
| **Autenticação e Segurança** | Firebase Authentication e Security Rules | Proteção em nível de banco de dados restringindo leitura de estadias, notas privadas e exclusões apenas ao administrador. |
| **PWA e Push** | `vite-plugin-pwa`, Service Workers, Canvas API, `ntfy.sh` | Instalação na Tela de Início, geração dinâmica de ícones `apple-touch-icon` / `maskable` e notificações push em tempo real. |
| **Deploy e Cloud** | Google AI Studio Build / Google Cloud Run | Hospedagem serverless contínua com injeção segura de variáveis de ambiente (`Secrets`). |

---

## Metodologia: AI-Assisted Engineering e Structured Vibe Coding

Este projeto foi desenvolvido aplicando **Structured Vibe Coding** combinado com **Spec-Driven Prompt Engineering** no ecossistema do **Google AI Studio (Gemini)**:
* **System Instructions Customizadas (`Absolute Mode`):** Configuração de persona técnica de zero-overhead para focar em arquitetura limpa e pronta para produção.
* **Engenharia Iterativa e Resolução de Casos Reais:**
  * Substituição de buckets externos por compressão binária `DataURL` via HTML5 Canvas direta no documento NoSQL, mantendo a operação 100% dentro do tier gratuito (*Firebase Spark Plan*) e 100% disponível offline.
  * Implementação de *Simple POST Requests* em JSON para contornar bloqueios de *CORS Preflight* no Safari iOS durante o disparo de webhooks de notificação.
  * Geração programática de ativos rasterizados (`.png`) a partir de vetores (`.svg`) em tempo de execução para compatibilidade total de instalação PWA no iOS e Android.

---

## Estrutura de Dados (Schema NoSQL)

* **`tutors`**: Dados do responsável e contato veterinário de emergência (indexado por `phoneDDD`).
* **`pets`**: 22 atributos estruturados cobrindo perfil físico, castração, sociabilidade, alergias/protocolos, tratamentos contínuos, restrições, histórico crônico, vacinação, comportamento, alimentação, rotina e foto compactada.
* **`stays`**: Histórico relacional de hospedagens (`petId` + `tutorId`) com controle de data/hora de entrada e saída, status (`pending`, `active`, `completed`) e anotações da estadia.
* **`pet_admin_notes`**: Coleção restrita exclusiva do administrador para observações permanentes de comportamento e manejo de cada cão.

---

## Como Executar Localmente

1. Clone o repositório:
   ```bash
   git clone https://github.com
   cd NOME_DO_REPOSITORIO
   ```

2. Instale as dependências:
   ```bash
   npm install
   ```

3. Crie um arquivo `.env` na raiz do projeto com as credenciais do seu projeto Firebase:
   ```env
   VITE_FIREBASE_API_KEY=sua_api_key
   VITE_FIREBASE_AUTH_DOMAIN=seu_://firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=seu_project_id
   VITE_FIREBASE_STORAGE_BUCKET=seu_projeto.firebasestorage.app
   VITE_FIREBASE_MESSAGING_SENDER_ID=seu_sender_id
   VITE_FIREBASE_APP_ID=seu_app_id
   VITE_FIREBASE_VAPID_KEY=sua_vapid_key
   ```

4. Inicie o servidor de desenvolvimento:
   ```bash
   npm run dev
   ```

---

## Licença

Projeto desenvolvido para uso real na operação **Mika & Xan** e disponibilizado para fins de portfólio.
