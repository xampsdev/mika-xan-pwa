Pet Boarding & Daycare PWA

> **Progressive Web App (PWA) Offline-First** para gestão de hospedagem domiciliar de cães, check-in inteligente de clientes recorrentes e controle administrativo em tempo real.

**Aplicação em Produção:** [https://mika-xan-pets.ai.studio/](https://mika-xan-pets.ai.studio/)  
**Autor:** Xan (`xampsdev`)

---

##  O Problema & A Solução

Antes deste projeto, o processo de pré-check-in dos cães hospedados em casa dependia de formulários terceirizados estáticos (`forms.app`) que enviavam respostas avulsas por e-mail. Isso gerava três gargalos reais:
1. **Retrabalho para clientes recorrentes:** Tutores precisavam preencher todas as 22 perguntas novamente a cada nova estadia.
2. **Falta de acesso offline rápido:** Consultar restrições alimentares, protocolos de alergia ou medicações exigia vasculhar e-mails antigos com conexão ativa.
3. **Ausência de fotos padronizadas por ficha:** Caso o cliente não enviasse foto no formulário, não havia como anexar um registro visual pela câmera direto no perfil do cão.

O **Mika & Xan PWA** resolve esse fluxo unificando o formulário público inteligente e o painel administrativo seguro em uma única aplicação instalável (Android e iOS) com sincronização local via **IndexedDB**.

---

## Funcionalidades Principais

### Fluxo Público do Cliente (Check-in Inteligente)
* **Busca Automática por Telefone (DDD):** Identifica tutores já cadastrados instantaneamente.
* **Auto-Preenchimento de Retorno:** Clientes recorrentes selecionam seu pet cadastrado, revisam as 22 informações de saúde/rotina em etapas organizadas e registram um novo check-in em segundos.
* **Compressão de Imagem Client-Side:** Fotos enviadas pelos tutores são redimensionadas e convertidas via HTML5 Canvas (`DataURL/WebP`) no próprio navegador, garantindo envio instantâneo (< 1s).

### Painel Administrativo Offline-First
* **Acesso Restrito (Zero-Trust Rules):** Autenticação via Firebase Auth combinada com regras de segurança (`firestore.rules`) travadas exclusivamente para o e-mail do administrador.
* **Sincronização Offline Nativa (`persistentLocalCache`):** Leitura e atualização de fichas funcionam mesmo sem internet, com indicador visual de status de sincronização em tempo real (`onSnapshot`).
* **Captura de Foto Fallback:** Permite tirar ou anexar a foto do cão diretamente na ficha administrativa caso o tutor não tenha enviado no cadastro inicial.
* **Alertas Médicos & Histórico de Estadias:** Destaque visual para alergias, restrições e medicações contínuas, além do registro histórico de todas as hospedagens (`pending`, `active`, `completed`) por animal.
* **Notificações Web Push Cross-Platform:** Suporte a alertas de novas fichas com tratamento específico para **iOS Safari (`standalone` mode)** e **Android**.

---

## Stack Tecnológica & Arquitetura

| Camada | Tecnologias Utilizadas | Papel na Arquitetura |
| :--- | :--- | :--- |
| **Frontend** | React 18, TypeScript, Vite | Componentização tipada das 22 variáveis clínicas/comportamentais do pet e build otimizado. |
| **Estilização & UI** | Tailwind CSS, Lucide Icons | Interface responsiva *Mobile-First* com ergonomia adaptada para toque. |
| **Banco de Dados** | Firebase Cloud Firestore (SDK v10+) | Modelagem NoSQL relacional em 3 coleções (`tutors`, `pets`, `stays`) com cache offline multi-abas (`persistentMultipleTabManager`). |
| **Autenticação & Segurança** | Firebase Authentication & Security Rules | Proteção em nível de banco de dados restringindo leitura global, edição de estadias e exclusão apenas ao admin. |
| **PWA & Push** | `vite-plugin-pwa`, Service Workers, Web Push API (FCM) | Instalação na Tela de Início (`manifest.json`), cache de ativos estáticos e disparo de notificações. |
| **Deploy & Cloud** | Google AI Studio Build / Google Cloud Run | Hospedagem serverless contínua com injeção segura de variáveis de ambiente (`Secrets`). |

---

## Metodologia: AI-Assisted Engineering & Vibe Coding

Este projeto foi desenvolvido aplicando **Vibe Coding estruturado** combinado com **Spec-Driven Prompt Engineering** no ecossistema do **Google AI Studio (Gemini)**.

Em vez de geração aleatória de código por tentativa e erro, o fluxo de desenvolvimento seguiu práticas de engenharia assistida por IA:
* **System Instructions Customizadas (`Absolute Mode`):** Configuração de persona técnica de zero-overhead no Gemini para eliminar código boilerplate desnecessário e focar em arquitetura pronta para produção.
* **Decomposição Modular em 5 Estágios (`Plan Mode` + `Default Mode`):**
  1. Modelagem de Schemas TypeScript e persistência offline do Firestore.
  2. Construção do fluxo público multi-etapas com lookup por telefone.
  3. Desenvolvimento do Dashboard Admin, histórico de check-ins e compressão de mídia via Canvas.
  4. Implementação de Service Workers e compatibilidade Web Push para iOS/Android.
  5. Blindagem com regras de produção (`firestore.rules`).
* **Resolução Iterativa de Limites de Infraestrutura:** Adaptação arquitetural da camada de mídia (substituindo buckets externos por compressão binária `DataURL` direta no documento NoSQL) para manter a operação 100% dentro do tier gratuito (*Firebase Spark Plan*) e 100% disponível offline.

---

## Estrutura de Dados (Schema)

* **`tutors`**: Dados do responsável e contato veterinário de emergência (indexado por `phoneDDD`).
* **`pets`**: 22 atributos estruturados cobrindo perfil físico, castração, sociabilidade, alergias/protocolos, tratamentos contínuos, restrições, histórico crônico, vacinação, ansiedade de separação, alimentação, rotina de passeios/sono/banho e foto compactada.
* **`stays`**: Histórico relacional de hospedagens (`petId` + `tutorId`) com controle de entrada, saída e status.

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
