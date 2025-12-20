@echo off
echo ==========================================
echo 🌙 NeuralWhisper GitHub Setup
echo ==========================================
echo.

echo 1. Checking Git Identity...
git config user.name
if %ERRORLEVEL% NEQ 0 (
    echo Please enter your Git Name (e.g. John Doe):
    set /p GITNAME=
    git config --global user.name "%GITNAME%"
)
git config user.email
if %ERRORLEVEL% NEQ 0 (
    echo Please enter your Git Email:
    set /p GITEMAIL=
    git config --global user.email "%GITEMAIL%"
)

echo.
echo 2. Committing changes...
git add -A
git commit -m "🚀 The dawn of neural whispers - Initial open source release"

echo.
echo 3. Authenticating with GitHub...
echo Please follow the browser login prompts if asked.
gh auth login -p https -w

echo.
echo 4. Creating and Pushing Repository...
gh repo create neuralwhisper --public --description "AI-powered whisper synthesis with 82M-parameter neural TTS running 100% in your browser" --source=. --push

echo.
echo ==========================================
echo 🎉 Success! Your repo should be live.
echo Manage it here: https://github.com/settings/repositories
echo ==========================================
pause
