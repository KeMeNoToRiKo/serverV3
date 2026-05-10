#include <iostream>
#include <fstream>
#include <sstream>
#include <string>
#include <map>
#include <limits>
#include <filesystem>
#include <cstdio>
#include <cstdlib>



/**
 * MgaPogiV3 Configuration Utility Application
 * This application allows users to modify the configuration settings
 * of the MgaPogiV3 project via a command-line interface.
 */


// Allows clear screen to work on all OS
#ifdef _WIN32
    #define CLEAR_SCREEN "cls"
#else
    #define CLEAR_SCREEN "clear"
#endif

// ==============================================================
// Allows entering to continue
// since getch is not available in standard C++
//
// Makes it easier to call clear screen
// ==============================================================
void waitForEnter() {
    std::cout << "Press Enter to continue...";
    std::cin.ignore(std::numeric_limits<std::streamsize>::max(), '\n'); // discard leftover input
}
void clearScreen() {
    system(CLEAR_SCREEN);
}


// ==============================================================
//                            Functions
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
    std::filesystem::current_path(
    std::filesystem::canonical(argv[0]).parent_path()
    );
    // ****** INIT VARIABLES ******
    int choice = 0;
    std::string filename = "config.ini";
    char confirm = ' ';

    // ****** MAIN LOOP ******
    while (true)
    {
        displayMenu();
        std::cout << "Enter your choice: ";

        // ** Gracefully handle all types of input **
        if (!(std::cin >> choice)) {
            // Handle non-integer input
            std::cout << "Invalid input! Please enter a number between 1 and 4." << std::endl;
            std::cin.clear(); // Clear error flags
            std::cin.ignore(std::numeric_limits<std::streamsize>::max(), '\n'); // Discard invalid input
            waitForEnter();
            clearScreen();
            continue;
        }

        std::cin.ignore(std::numeric_limits<std::streamsize>::max(), '\n'); // flush leftover newline
        clearScreen();

        // ****** VARIABLES ******
        // We need these inside the loop to reset them each iteration
        int provider = 0;
        std::string model;

        switch (choice) {
        case 1: // **Change AI Provider**
            while (true) { // loop until valid input
                changeProviderMenu();
                std::cout << "Enter your choice: ";
                // ** Gracefully handle all types of input **
                if (!(std::cin >> provider)) {
                    // Handle non-integer input
                    std::cout << "Invalid input! Please enter a number between 1 and 2." << std::endl;
                    std::cin.clear(); // Clear error flags
                    std::cin.ignore(std::numeric_limits<std::streamsize>::max(), '\n'); // this is the c++ way of deleting input buffer
                    waitForEnter();
                    clearScreen();
                    continue;
                }
                if(provider == 1) { //** NONE **/
                    updateIniValue(filename, "ai", "provider", "none");
                    std::cout << "AI Provider changed to None." << std::endl;
                } else if(provider == 2) { //** GEMINI **/
                    updateIniValue(filename, "ai", "provider", "gemini");
                    std::cout << "AI Provider changed to Gemini." << std::endl;
                } else if (provider == 3) { //** OLLAMA **/
                    updateIniValue(filename, "ai", "provider", "ollama");
                    std::cout << "AI Provider changed to Ollama." << std::endl;
                }
                break;
            }
            std::cin.ignore(std::numeric_limits<std::streamsize>::max(), '\n'); // Discard invalid input
            waitForEnter();
            clearScreen();

            break;
        case 2: // **Change Model**
            while (true) { // loop until valid input
                changeModelProvider();
                std::cout << "Enter your choice: ";
                // ** Gracefully handle all types of input **
                if (!(std::cin >> provider)) {
                    // Handle non-integer input
                    std::cout << "Invalid input! Please enter a number between 1 and 2." << std::endl;
                    std::cin.clear(); // Clear error flags
                    std::cin.ignore(std::numeric_limits<std::streamsize>::max(), '\n'); // Why do we even need this again???
                    waitForEnter();
                    clearScreen();
                    continue;
                }
                std::cin.ignore(std::numeric_limits<std::streamsize>::max(), '\n'); // again
                clearScreen();
                changeModelMenu();
                // We use getline instead of cin to allow spaces in model names
                std::getline(std::cin, model);

                // ** What in the ternary abomination is this **
                /**
                 * Reads like:
                 * If provider is 1 (Gemini), update the Gemini model,
                 * else update the Ollama model.
                 * Dapat if else nalang noh
                 */
                provider == 1 ? updateIniValue(filename, "model", "gemini", model) :
                                updateIniValue(filename, "model", "ollama", model);
                std::cout << "Model updated successfully." << std::endl;
                waitForEnter();
                clearScreen();
                break;
            }
            break;
        case 3: // **Change Prompt**
            while (true) {
                    changePromptMenu();
                    std::string prompt;
                    std::getline(std::cin, prompt); // allow spaces in prompt

                    // ** Confirm prompt change **
                    // we don't want accidental changes
                    while (true) {
                        std::cout << "Are you sure you want to change the prompt to:\n\"" << prompt << "\" ? (y/n): ";
                        std::cin >> confirm;

                        // clear leftover input (like newline) after reading confirm
                        std::cin.ignore(std::numeric_limits<std::streamsize>::max(), '\n');

                        if(confirm == 'y' || confirm == 'Y') {
                            updateIniValue(filename, "prompt", "masterPrompt", prompt);
                            std::cout << "Prompt updated successfully." << std::endl;
                            break;
                        } else if(confirm == 'n' || confirm == 'N') {
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

        // **Reset to Default**
        /**
         *  Default Values are:
         * AI Provider: none
         * Gemini Model: gemini-2.0-flash
         * Ollama Model: gemma3
         * Prompt: You will answer the question only in the given choices of answers.
         * If you think there is no correct answer, you will guess the best answer from the given choices.
         * If asked to choose more than one answer, separate them by a newline\nQuestion:
         * 
         * The user may confirm or cancel the reset action.
         */
        case 4: 
            while (true) { // we don't want accidental resets
                std::cout << "Are you sure you want to reset to default values? (y/n): ";
                std::cin >> confirm;

                // clear leftover input (like newline) after reading confirm
                        std::cin.ignore(std::numeric_limits<std::streamsize>::max(), '\n');

                        if(confirm == 'y' || confirm == 'Y') {
                            // WHATDAFAK IS DIS????? (works)
                            /**
                             * Reads like:
                             * If confirm is 'y' or 'Y', call resetDefault() and print success message,
                             * else print reset canceled message.
                             * It uses lambda functions to achieve this in a single expression. (WOW!)
                             */
                            (confirm == 'y' || confirm == 'Y') 
                            ? [](){ resetDefault(); std::cout << "Configuration reset to default values." << std::endl;}() 
                            : [](){ std::cout << "Reset canceled." << std::endl; }();
                            break;
                        } else if(confirm == 'n' || confirm == 'N') {
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
        case 5: // **Exit**
            std::cout << "Exiting..." << std::endl;
            waitForEnter();
            return 0;
        default:
            std::cout << "Invalid choice. Please try again." << std::endl;
        }
    }
    std::cout << "Configuration updated successfully." << std::endl;
    return 0;

    
}

// **=============================================================================
//                          Function Definitions
// **=============================================================================

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
    std::filesystem::path configPath = std::filesystem::absolute(filename);
    std::filesystem::path tempPath   = configPath.string() + ".tmp";

    // Ensure config file exists
    if (!std::filesystem::exists(configPath)) {
        std::ofstream create(configPath);
        create.close();
    }

    std::ifstream infile(configPath);
    if (!infile.is_open()) {
        std::cerr << "Failed to open config file: "
                  << configPath << std::endl;
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
        std::string trimmed = line;
        trimmed.erase(0, trimmed.find_first_not_of(" \t"));

        // Section header
        if (!trimmed.empty() &&
            trimmed.front() == '[' &&
            trimmed.back()  == ']')
        {
            if (sectionFound && !keyWritten) {
                outfile << key << "=" << newValue << '\n';
                keyWritten = true;
            }

            currentSection = trimmed;
            outfile << line << '\n';

            if (currentSection == "[" + section + "]") {
                sectionFound = true;
            }
            continue;
        }

        // Key replacement
        if (currentSection == "[" + section + "]" &&
            trimmed.rfind(key + "=", 0) == 0)
        {
            outfile << key << "=" << newValue << '\n';
            keyWritten = true;
        }
        else {
            outfile << line << '\n';
        }
    }

    // Missing section → append
    if (!sectionFound) {
        outfile << "\n[" << section << "]\n";
        outfile << key << "=" << newValue << '\n';
    }
    // Section exists but key missing
    else if (!keyWritten) {
        outfile << key << "=" << newValue << '\n';
    }

    infile.close();
    outfile.close();

    // Atomic replace (Windows / Linux / macOS)
    std::filesystem::remove(configPath);
    std::filesystem::rename(tempPath, configPath);
}


void changeProviderMenu() {
    std::cout << "Select AI Provider to change:" << std::endl;
    std::cout << "[These are all the available AI Providers]" << std::endl;
    std::cout << "1. None" << std::endl;
    std::cout << "2. Gemini" << std::endl;
    std::cout << "3. Ollama" << std::endl;
    std::cout << "Enter your choice: ";
}

void changeModelProvider() {
    std::cout << "Select AI Provider to change:" << std::endl;
    std::cout << "[These are all the available AI Providers]" << std::endl;
    std::cout << "1. Gemini" << std::endl;
    std::cout << "2. Ollama" << std::endl;
    std::cout << "Enter your choice: ";
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
    updateIniValue(filename, "prompt", "masterPrompt", "You will answer the question only in the given choices of answers. If you think there is no correct answer, you will guess the best answer from the given choices. If asked to choose more than one answer, separate them by a newline\\nQuestion:");
}