# Unity Error Predictor

A VS Code extension to predict compile errors and warnings for Unity C# projects, designed to be fast and accurate.

This extension provides two distinct analysis modes to fit your workflow.

## Features

- **Side Bar UI**: All operations can be performed from a dedicated view in the side bar.
- **Directory Selection**: Easily select your Unity project's root directory for analysis.
- **Real-time Progress**: See which file or project is being analyzed in real-time.

### Analysis Modes

1.  **⚡ Fast Check (Syntax)**
    -   **Purpose**: Instantly find syntax errors like missing semicolons or mismatched brackets during daily coding.
    -   **Speed**: Extremely fast, completes in seconds.
    -   **Accuracy**: Perfectly detects C# syntax errors. It does **not** report false-positive dependency errors (e.g., "UnityEngine not found").

2.  **🔍 Deep Check (Full)**
    -   **Purpose**: Perform a full analysis that is nearly identical to the Unity Editor's compilation process, detecting complex dependency errors, type mismatches, and more.
    -   **Speed**: Slower, as it analyzes the entire project structure.
    -   **Accuracy**: The highest possible accuracy. It correctly resolves dependencies from your project's `.sln` and `.csproj` files and respects Unity's specific warning suppressions (`<NoWarn>`).

## Requirements

- **.NET 8.0 SDK** (or newer)
- **Visual Studio** (Community edition is free) with the **".NET desktop development"** workload installed. This is required for the "Deep Check" mode to function correctly.

## How to Use

### One-Time Setup in Unity Editor

For the "Deep Check" mode to work flawlessly, you must first generate the necessary project files.

1.  In the Unity Editor, go to `Edit > Preferences`.
2.  Select the `External Tools` tab.
3.  Ensure `External Script Editor` is set to your editor (e.g., Visual Studio Code).
4.  Click the **`Regenerate project files`** button.

### Performing Analysis

1.  Click the Beaker icon (` beaker `) in the Activity Bar to open the extension's view.
2.  Select your Unity project's **root folder** (the one containing the `Assets` and `ProjectSettings` folders) using the "Browse..." button, or ensure it's automatically filled if you have the folder open in your workspace.
3.  Click **"Fast Check"** for a quick syntax scan.
4.  Click **"Deep Check"** for a complete, high-accuracy analysis.
5.  Results will appear in the list below. Click on any item to jump directly to the file and line.

### Initial Extension Setup

The very first time you run an analysis, the extension will ask you to locate the `UnityErrorPredictor.Analyzer.exe` file. Please select it from the `analyzer/UnityErrorPredictor.Analyzer/bin/Release/net8.0/` folder within this project's source code. This is a one-time setup.