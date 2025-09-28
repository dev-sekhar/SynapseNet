# Contributing to SynapseNet

We welcome contributions to SynapseNet! To ensure a smooth and collaborative development process, please adhere to the following guidelines.

## 1. Getting Started

- Clone the repository: `git clone https://github.com/your-org/SynapseNet.git`
- Set up your local development environment (see local setup instructions in README).

## 2. Version Control (Git) Guidelines

- ... (Keep this section as is) ...

## 3. Coding Standards & Best Practices

- **JavaScript / TypeScript (for Hyperledger Fabric Chaincode, Backend API & Frontend):** [To be defined below]

1. Formatting: Always run Prettier for all code formatting.
2. Linting: Use ESLint with a recommended TypeScript configuration (e.g., @typescript-eslint/eslint-plugin).
3. TypeScript Usage:

- Strive for strong typing. Avoid any unless absolutely necessary (and justified with a comment).
- Use interfaces/types for data structures, API contracts.
- Compile with strict null checks.

4. Asynchronous Code: Prefer async/await for asynchronous operations. Handle promises correctly.
5. Module Structure: Consistent use of ES Modules (import/export).
6. API Design (Backend): Follow RESTful principles for backend APIs.
7. Error Handling: Implement centralized error handling for backend, frontend, and mobile.
8. Chaincode Specifics (JavaScript/TypeScript on Fabric):

- Ensure chaincode is deterministic (no random numbers, system time).
- Properly handle chaincode arguments and responses.
- Use the fabric-contract-api for defining contracts.
- Avoid side effects outside of the ledger state changes.

9.  React Native Specifics (Mobile Frontend):

- Component Structure: Consistent component organization (e.g., atomic design, pages/components).
- Styling: Use StyleSheet API or a consistent styling solution (e.g., styled-components, Tailwind CSS for React Native).
- State Management: Choose a consistent state management solution (e.g., React Context, Redux Toolkit, Zustand).
- Navigation: Use React Navigation for consistent app navigation.
- Performance: Optimize component rendering, minimize re-renders.
- Accessibility: Adhere to mobile accessibility guidelines (e.g., accessibilityLabel, alt text for images).
- Native Modules: Use sparingly and for platform-specific functionalities not covered by core React Native.
- Mobile-First UX: Design with touch targets, thumb zones, and simplified interactions in mind.

* **Python (for AI Services & Utilities):** [To be defined below]

1. Formatting: Use Black for opinionated code formatting.
2. Linting: Use Flake8 or Pylint (Black + Flake8 is a common combo).
3. Type Hinting: Use Python's type hints (mypy) for better code clarity and maintainability.
4. Virtual Environments: Always use virtual environments (venv or conda) for project dependencies.
5. Dependency Management: Use pip with requirements.txt or a tool like Poetry.
6. Docstrings: Write clear docstrings for modules, classes, and functions (e.g., NumPy or Google style).
7. AI Specifics:

- Document models, datasets, and training procedures clearly.
- Consider explainability and fairness in model design.

* **General Best Practices:** [To be defined below]

## 4. Documentation Guidelines

- ... (Keep this section as is) ...

## 5. Security Best Practices

- ... (Keep this section as is) ...

## 6. Testing

- ... (Keep this section as is) ...

## 7. Reporting Issues

- ... (Keep this section as is) ...
