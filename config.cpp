#include <iostream>
#include <fstream>
#include <sstream>
#include <string>
#include <map>
#include <limits>

#ifdef _WIN32
    #define CLEAR_SCREEN "cls"
#else
    #define CLEAR_SCREEN "clear"
#endif

void waitForEnter() {
    std::cout << "Press Enter to continue...";
    std::cin.ignore(std::numeric_limits<std::streamsize>::max(), '\n'); // discard leftover input
}
void clearScreen() {
    system(CLEAR_SCREEN);
}

void resetDefault();
void changeProviderMenu();
void changeModelProvider();
void changeModelMenu();
void changePromptMenu();
void displayMenu();
void updateIniValue(const std::string& filename, const std::string& section,
                    const std::string& key, const std::string& newValue);


int main() {
    int choice = 0;
    std::string filename = "config.ini";
    char confirm = ' ';


    // MAIN LOOP
    while (true)
    {
        displayMenu();
        std::cout << "Enter your choice: ";

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

        int provider = 0;
        std::string model;

        switch (choice)
        {
        case 1:
            while (true) {
                changeProviderMenu();
                std::cout << "Enter your choice: ";
                if (!(std::cin >> provider)) {
                    // Handle non-integer input
                    std::cout << "Invalid input! Please enter a number between 1 and 2." << std::endl;
                    std::cin.clear(); // Clear error flags
                    std::cin.ignore(std::numeric_limits<std::streamsize>::max(), '\n'); // Discard invalid input
                    waitForEnter();
                    clearScreen();
                    continue;
                }
                if(provider == 1) {
                    updateIniValue(filename, "ai", "provider", "none");
                    std::cout << "AI Provider changed to None." << std::endl;
                } else if(provider == 2) {
                    updateIniValue(filename, "ai", "provider", "gemini");
                    std::cout << "AI Provider changed to Gemini." << std::endl;
                } else if (provider == 3) {
                    updateIniValue(filename, "ai", "provider", "ollama");
                    std::cout << "AI Provider changed to Ollama." << std::endl;
                }
                break;
            }
            std::cin.ignore(std::numeric_limits<std::streamsize>::max(), '\n'); // Discard invalid input
            waitForEnter();
            clearScreen();

            break;
        case 2:
            
            while (true) {
                changeModelProvider();
                std::cout << "Enter your choice: ";
                if (!(std::cin >> provider)) {
                    // Handle non-integer input
                    std::cout << "Invalid input! Please enter a number between 1 and 2." << std::endl;
                    std::cin.clear(); // Clear error flags
                    std::cin.ignore(std::numeric_limits<std::streamsize>::max(), '\n'); // Discard invalid input
                    waitForEnter();
                    clearScreen();
                    continue;
                }
                std::cin.ignore(std::numeric_limits<std::streamsize>::max(), '\n');
                clearScreen();
                changeModelMenu();
                std::getline(std::cin, model);

                provider == 1 ? updateIniValue(filename, "model", "gemini", model) :
                                updateIniValue(filename, "model", "ollama", model);
                std::cout << "Model updated successfully." << std::endl;
                waitForEnter();
                clearScreen();
                break;
            }
            break;
        case 3:
            while (true) {
                    changePromptMenu();
                    std::string prompt;
                    std::getline(std::cin, prompt);

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


        case 4:

        
            

            while (true) {
                std::cout << "Are you sure you want to reset to default values? (y/n): ";
                std::cin >> confirm;

                // clear leftover input (like newline) after reading confirm
                        std::cin.ignore(std::numeric_limits<std::streamsize>::max(), '\n');

                        if(confirm == 'y' || confirm == 'Y') {
                            // WHATDAFAK IS DIS????? (works)
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
        case 5:
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

void displayMenu() {
    std::cout << "=== MgaPogiV3 Configuration Menu ===" << std::endl;
    std::cout << "1. Change AI Provider" << std::endl;
    std::cout << "2. Change Model" << std::endl;
    std::cout << "3. Change Prompt" << std::endl;
    std::cout << "4. Reset to Default" << std::endl;
    std::cout << "5. Exit" << std::endl;
}

// Function to update a key in a section
void updateIniValue(const std::string& filename, const std::string& section,
                    const std::string& key, const std::string& newValue) {
    std::ifstream infile(filename);
    std::ofstream outfile("config_temp.ini");

    if (!infile.is_open() || !outfile.is_open()) {
        std::cerr << "Error opening config file." << std::endl;
        return;
    }

    std::string line;
    std::string currentSection;

    while (std::getline(infile, line)) {
        std::string trimmed = line;
        // Remove spaces from start
        trimmed.erase(0, trimmed.find_first_not_of(" \t"));

        // Detect section
        if (!trimmed.empty() && trimmed[0] == '[') {
            currentSection = trimmed;
            outfile << line << std::endl;
            continue;
        }

        // Only modify lines in the correct section
        if (currentSection == "[" + section + "]") {
            // Skip commented keys
            if (trimmed.find(key + "=") == 0) {
                outfile << key << "=" << newValue << std::endl;
                continue;
            }
        }

        outfile << line << std::endl;
    }

    infile.close();
    outfile.close();

    // Replace original file
    std::remove(filename.c_str());
    std::rename("config_temp.ini", filename.c_str());
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