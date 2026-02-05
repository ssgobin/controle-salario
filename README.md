# 💸 Controle de Salário

![Build](https://img.shields.io/badge/build-passing-brightgreen)
![License](https://img.shields.io/badge/license-MIT-blue)
![Firebase](https://img.shields.io/badge/firebase-Firestore%20%2B%20Auth-ffca28?logo=firebase&logoColor=black)
![Bootstrap](https://img.shields.io/badge/bootstrap-5.3.3-7952B3?logo=bootstrap&logoColor=white)

Aplicação web para controle financeiro pessoal e compartilhado, com autenticação, lançamentos por mês, recorrência e sincronização em tempo real com Firebase.

---

## ✨ Funcionalidades

- Autenticação com:
  - Google
  - Email e senha
- Gestão financeira por mês (`YYYY-MM`)
- Cadastro e edição de:
  - Recebimentos
  - Despesas
- Controle de status de pagamento
- Resumo automático:
  - Total de receitas
  - Total de despesas
  - Saldo do mês
  - Valor pago + barra de progresso
- Geração de recebimentos automáticos (2 parcelas, dias configuráveis)
- Recorrência mensal
- Cofre compartilhado:
  - Criar cofre com código
  - Entrar com código
  - Sair do cofre
- Exportar / Importar dados em JSON
- Reset de dados da conta

---

## 🧰 Tecnologias

- **HTML5**
- **CSS3**
- **JavaScript (Vanilla)**
- **Bootstrap 5.3.3**
- **Firebase Auth**
- **Firebase Firestore**
- **SweetAlert2** (opcional, com fallback para `alert/confirm`)

---

## 📁 Estrutura do projeto

```text
.
├─ index.html
├─ app.js
└─ assets/
   ├─ css/
   │  └─ styles.css
   └─ img/
      ├─ favicon-16x16.png
      ├─ favicon-32x32.png
      ├─ apple-touch-icon.png
      └─ site.webmanifest
```

---

## 🚀 Como rodar localmente

1. Clone o repositório:
   ```bash
   git clone https://github.com/SEU_USUARIO/SEU_REPO.git
   cd SEU_REPO
   ```

2. Abra com VSCode

3. Rode com **Live Server** no `index.html`

> Dica: o próprio código comenta que Live Server ajuda no fluxo local.

---

## 🔐 Configuração do Firebase

No `app.js`, mantenha/configure o objeto `firebaseConfig`:

```js
const firebaseConfig = {
  apiKey: "...",
  authDomain: "...",
  projectId: "...",
  storageBucket: "...",
  messagingSenderId: "...",
  appId: "..."
};
```

No console do Firebase, habilite:

- **Authentication**
  - Google
  - Email/Password
- **Cloud Firestore**

---

## 🗄️ Modelo de dados (Firestore)

### Escopo pessoal
- `users/{uid}`
- `users/{uid}/meta/settings`
- `users/{uid}/tx/{txId}`
- `users/{uid}/recurring/{recurringId}`

### Escopo compartilhado (cofre)
- `households/{code}`
- `households/{code}/members/{uid}`
- `households/{code}/meta/settings`
- `households/{code}/tx/{txId}`
- `households/{code}/recurring/{recurringId}`

A aplicação alterna entre escopo pessoal e cofre via variável de contexto (`SCOPE`).

---

## 🧠 Regras de negócio principais

- Lançamentos são vinculados ao mês selecionado.
- Recebimentos automáticos dividem o salário em 2 partes (50/50).
- Recorrências geram novos lançamentos mensais com base em templates.
- O estado da interface é atualizado conforme escopo e autenticação.

---

## 🤝 Contribuindo

1. Faça um fork
2. Crie sua branch:
   ```bash
   git checkout -b feat/minha-feature
   ```
3. Commit:
   ```bash
   git commit -m "feat: minha feature"
   ```
4. Push:
   ```bash
   git push origin feat/minha-feature
   ```
5. Abra um Pull Request

---

## 👤 Autor

Desenvolvido por **João Vitor Sgobin** ✨
