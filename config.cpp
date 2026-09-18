#include <iostream>
#include <fstream>
#include <sstream>
#include <string>
#include <map>
#include <limits>
#include <filesystem>
#include <cstdio>
#include <cstdlib>
#include <system_error>

/**
 * MgaPogiV3 Configuration Utility Application
 * This application allows users to modify the configuration settings
 * of the MgaPogiV3 project via a command-line interface.
 *
 * Cross-platform: Windows, Linux, macOS.
 */

// ==============================================================
//                      OS-specific defines
// ==============================================================
#ifdef _WIN32
    #define CLEAR_SCREEN "cls"
#else
    #define CLEAR_SCREEN "clear"
#endif

// ==============================================================
//                        Helper functions
// ==============================================================
void waitForEnter() {
    std::cout << "Press Enter to continue...";
    std::cin.ignore(std::numeric_limits<std::streamsize>::max(), '\n');
}

void clearScreen() {
    // std::system return value intentionally ignored — cosmetic operation.
    // Cast to void to silence -Wunused-result on Linux/macOS.
    (void)!std::system(CLEAR_SCREEN);
}

// Trim trailing CR (handles Windows-style CRLF files read on Unix)
// and trailing whitespace.
static void rtrim(std::string& s) {
    while (!s.empty() &&
           (s.back() == '\r' || s.back() == ' ' || s.back() == '\t')) {
        s.pop_back();
    }
}

// Cross-platform "where am I" — robust against argv[0] not being a path
// (e.g. when launched via PATH lookup on Linux/macOS).
static std::filesystem::path getExecutableDir(const char* argv0) {
    namespace fs = std::filesystem;
    std::error_code ec;

    if (argv0 && *argv0) {
        fs::path p(argv0);
        // If argv[0] contains a separator, treat it as a path.
        if (p.has_parent_path() || p.is_absolute()) {
            fs::path canon = fs::canonical(p, ec);
            if (!ec) return canon.parent_path();
        }
    }
    // Fallback: current working directory.
    fs::path cwd = fs::current_path(ec);
    if (!ec) return cwd;
    return fs::path(".");
}

// ==============================================================
//                         Forward decls
// ==============================================================
void resetDefault();
void changeProviderMenu();
void changeModelProvider();
void changeModelMenu();
void changePromptMenu();
void displayMenu();
void updateIniValue(const std::string& filename, const std::string& section,
                    const std::string& key, const std::string& newValue);


int main(int argc, char* argv[]) {
    namespace fs = std::filesystem;

    // Set CWD to the executable's directory so config.ini is found
    // regardless of where the user launched the binary from.
    std::error_code ec;
    fs::path exeDir = getExecutableDir(argc > 0 ? argv[0] : nullptr);
    fs::current_path(exeDir, ec);
    // If this fails we just continue from the current CWD — non-fatal.

    int choice = 0;
    std::string filename = "config.ini";
    char confirm = ' ';

    while (true)
    {
        displayMenu();
        std::cout << "Enter your choice: ";

        if (!(std::cin >> choice)) {
            std::cout << "Invalid input! Please enter a number between 1 and 5." << std::endl;
            std::cin.clear();
            std::cin.ignore(std::numeric_limits<std::streamsize>::max(), '\n');
            waitForEnter();
            clearScreen();
            continue;
        }

        std::cin.ignore(std::numeric_limits<std::streamsize>::max(), '\n');
        clearScreen();

        int provider = 0;
        std::string model;

        switch (choice) {
        case 1: // Change AI Provider
            while (true) {
                changeProviderMenu();
                std::cout << "Enter your choice: ";
                if (!(std::cin >> provider)) {
                    std::cout << "Invalid input! Please enter a number between 1 and 3." << std::endl;
                    std::cin.clear();
                    std::cin.ignore(std::numeric_limits<std::streamsize>::max(), '\n');
                    waitForEnter();
                    clearScreen();
                    continue;
                }
                if (provider == 1) {
                    updateIniValue(filename, "ai", "provider", "none");
                    std::cout << "AI Provider changed to None." << std::endl;
                } else if (provider == 2) {
                    updateIniValue(filename, "ai", "provider", "gemini");
                    std::cout << "AI Provider changed to Gemini." << std::endl;
                } else if (provider == 3) {
                    updateIniValue(filename, "ai", "provider", "ollama");
                    std::cout << "AI Provider changed to Ollama." << std::endl;
                } else {
                    std::cout << "Invalid choice. Please enter 1, 2, or 3." << std::endl;
                    waitForEnter();
                    clearScreen();
                    continue;
                }
                break;
            }
            std::cin.ignore(std::numeric_limits<std::streamsize>::max(), '\n');
            waitForEnter();
            clearScreen();
            break;

        case 2: // Change Model
            while (true) {
                changeModelProvider();
                std::cout << "Enter your choice: ";
                if (!(std::cin >> provider)) {
                    std::cout << "Invalid input! Please enter a number between 1 and 2." << std::endl;
                    std::cin.clear();
                    std::cin.ignore(std::numeric_limits<std::streamsize>::max(), '\n');
                    waitForEnter();
                    clearScreen();
                    continue;
                }
                if (provider != 1 && provider != 2) {
                    std::cout << "Invalid choice. Please enter 1 or 2." << std::endl;
                    std::cin.ignore(std::numeric_limits<std::streamsize>::max(), '\n');
                    waitForEnter();
                    clearScreen();
                    continue;
                }
                std::cin.ignore(std::numeric_limits<std::streamsize>::max(), '\n');
                clearScreen();
                changeModelMenu();
                std::getline(std::cin, model);

                if (provider == 1) {
                    updateIniValue(filename, "model", "gemini", model);
                } else {
                    updateIniValue(filename, "model", "ollama", model);
                }
                std::cout << "Model updated successfully." << std::endl;
                waitForEnter();
                clearScreen();
                break;
            }
            break;

        case 3: // Change Prompt
            while (true) {
                changePromptMenu();
                std::string prompt;
                std::getline(std::cin, prompt);

                while (true) {
                    std::cout << "Are you sure you want to change the prompt to:\n\""
                              << prompt << "\" ? (y/n): ";
                    std::cin >> confirm;
                    std::cin.ignore(std::numeric_limits<std::streamsize>::max(), '\n');

                    if (confirm == 'y' || confirm == 'Y') {
                        updateIniValue(filename, "prompt", "masterPrompt", prompt);
                        std::cout << "Prompt updated successfully." << std::endl;
                        break;
                    } else if (confirm == 'n' || confirm == 'N') {
                        std::cout << "Prompt change canceled." << std::endl;
                        break;
                    } else {
                        std::cout << "Invalid input! Please enter 'y' or 'n'." << std::endl;
                        waitForEnter();
                        clearScreen();
                    }
                }
                waitForEnter();
                clearScreen();
                break;
            }
            break;

        case 4: // Reset to Default
            while (true) {
                std::cout << "Are you sure you want to reset to default values? (y/n): ";
                std::cin >> confirm;
                std::cin.ignore(std::numeric_limits<std::streamsize>::max(), '\n');

                if (confirm == 'y' || confirm == 'Y') {
                    resetDefault();
                    std::cout << "Configuration reset to default values." << std::endl;
                    break;
                } else if (confirm == 'n' || confirm == 'N') {
                    std::cout << "Reset to Default canceled." << std::endl;
                    break;
                } else {
                    std::cout << "Invalid input! Please enter 'y' or 'n'." << std::endl;
                    waitForEnter();
                    clearScreen();
                }
            }
            waitForEnter();
            clearScreen();
            break;

        case 5: // Exit
            std::cout << "Exiting..." << std::endl;
            return 0;

        default:
            std::cout << "Invalid choice. Please try again." << std::endl;
            waitForEnter();
            clearScreen();
        }
    }
    return 0;
}

// ==============================================================
//                       Function Definitions
// ==============================================================

void displayMenu() {
    std::cout << "=== MgaPogiV3 Configuration Menu ===" << std::endl;
    std::cout << "1. Change AI Provider" << std::endl;
    std::cout << "2. Change Model" << std::endl;
    std::cout << "3. Change Prompt" << std::endl;
    std::cout << "4. Reset to Default" << std::endl;
    std::cout << "5. Exit" << std::endl;
}

void updateIniValue(const std::string& filename,
                    const std::string& section,
                    const std::string& key,
                    const std::string& newValue)
{
    namespace fs = std::filesystem;
    std::error_code ec;

    fs::path configPath = fs::absolute(filename, ec);
    if (ec) {
        std::cerr << "Failed to resolve config path: " << ec.message() << std::endl;
        return;
    }
    fs::path tempPath = configPath;
    tempPath += ".tmp";

    // Ensure config file exists.
    if (!fs::exists(configPath, ec)) {
        std::ofstream create(configPath);
        if (!create.is_open()) {
            std::cerr << "Failed to create config file: " << configPath << std::endl;
            return;
        }
    }

    std::ifstream infile(configPath);
    if (!infile.is_open()) {
        std::cerr << "Failed to open config file: " << configPath << std::endl;
        return;
    }

    std::ofstream outfile(tempPath);
    if (!outfile.is_open()) {
        std::cerr << "Failed to create temp config file." << std::endl;
        return;
    }

    std::string line;
    std::string currentSection;
    bool sectionFound = false;
    bool keyWritten   = false;

    while (std::getline(infile, line)) {
        // Strip trailing CR so CRLF files work on Unix.
        std::string raw = line;
        rtrim(raw);

        std::string trimmed = raw;
        trimmed.erase(0, trimmed.find_first_not_of(" \t"));

        // Section header.
        if (!trimmed.empty() &&
            trimmed.front() == '[' &&
            trimmed.back()  == ']')
        {
            if (sectionFound && !keyWritten) {
                outfile << key << "=" << newValue << '\n';
                keyWritten = true;
            }

            currentSection = trimmed;
            outfile << raw << '\n';

            if (currentSection == "[" + section + "]") {
                sectionFound = true;
            }
            continue;
        }

        // Key replacement.
        if (currentSection == "[" + section + "]" &&
            trimmed.rfind(key + "=", 0) == 0)
        {
            outfile << key << "=" << newValue << '\n';
            keyWritten = true;
        }
        else {
            outfile << raw << '\n';
        }
    }

    if (!sectionFound) {
        outfile << "\n[" << section << "]\n";
        outfile << key << "=" << newValue << '\n';
    }
    else if (!keyWritten) {
        outfile << key << "=" << newValue << '\n';
    }

    infile.close();
    outfile.close();

    // Cross-platform replace.
    // POSIX rename() overwrites the destination atomically.
    // Windows std::filesystem::rename also overwrites in C++17 (via MoveFileExW).
    fs::rename(tempPath, configPath, ec);
    if (ec) {
        // Fallback: remove + rename (e.g. if filesystem refuses cross-device rename).
        std::error_code ec2;
        fs::remove(configPath, ec2);
        fs::rename(tempPath, configPath, ec2);
        if (ec2) {
            // Last resort: copy + remove.
            fs::copy_file(tempPath, configPath,
                          fs::copy_options::overwrite_existing, ec2);
            fs::remove(tempPath, ec2);
            if (ec2) {
                std::cerr << "Failed to update config file: "
                          << ec2.message() << std::endl;
            }
        }
    }
}

void changeProviderMenu() {
    std::cout << "Select AI Provider to change:" << std::endl;
    std::cout << "[These are all the available AI Providers]" << std::endl;
    std::cout << "1. None" << std::endl;
    std::cout << "2. Gemini" << std::endl;
    std::cout << "3. Ollama" << std::endl;
}

void changeModelProvider() {
    std::cout << "Select AI Provider to change:" << std::endl;
    std::cout << "[These are all the available AI Providers]" << std::endl;
    std::cout << "1. Gemini" << std::endl;
    std::cout << "2. Ollama" << std::endl;
}

void changeModelMenu() {
    std::cout << "Input Model of choice" << std::endl;
    std::cout << "Model: ";
}

void changePromptMenu() {
    std::cout << " - Change Prompt Menu - " << std::endl;
    std::cout << "Enter new prompt: ";
}

void resetDefault() {
    std::string filename = "config.ini";
    updateIniValue(filename, "ai", "provider", "none");
    updateIniValue(filename, "model", "gemini", "gemini-2.0-flash");
    updateIniValue(filename, "model", "ollama", "gemma3");
    updateIniValue(filename, "prompt", "masterPrompt",
        "You will answer the question only in the given choices of answers. "
        "If you think there is no correct answer, you will guess the best answer "
        "from the given choices. If asked to choose more than one answer, "
        "separate them by a newline\\nQuestion:");
}