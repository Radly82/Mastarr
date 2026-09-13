package main

import (
	"fmt"
	"log"
	"net/http"
	"os/exec"
	"runtime"
	"time"
)

func main() {
	// Get the directory where the executable is located
	execPath, err := exec.LookPath(os.Args[0])
	if err != nil {
		log.Fatal("Error finding executable path:", err)
	}

	// Resolve symlinks to get the actual path
	realPath, err := exec.LookPath(execPath)
	if err != nil {
		log.Fatal("Error resolving executable path:", err)
	}

	// Get the directory
	dir := ""
	if runtime.GOOS == "windows" {
		dir = realPath[:len(realPath)-len("mastarr-server.exe")]
	} else {
		dir = realPath[:len(realPath)-len("mastarr-server")]
	}

	// Serve files from the current directory
	fs := http.FileServer(http.Dir(dir))
	http.Handle("/", fs)

	// Start the server in a goroutine
	go func() {
		log.Println("Server starting on http://localhost:8080")
		log.Fatal(http.ListenAndServe(":8080", nil))
	}()

	// Give the server a moment to start
	time.Sleep(500 * time.Millisecond)

	// Open the browser
	url := "http://localhost:8080/index.html"
	var err error
	
	switch runtime.GOOS {
	case "windows":
		err = exec.Command("rundll32.exe", "url.dll,FileProtocolHandler", url).Start()
	case "darwin":
		err = exec.Command("open", url).Start()
	case "linux":
		err = exec.Command("xdg-open", url).Start()
	default:
		fmt.Println("Unsupported platform")
	}
	
	if err != nil {
		log.Println("Error opening browser:", err)
		fmt.Println("Please open your browser and navigate to:", url)
	}

	// Keep the server running
	fmt.Println("Press Ctrl+C to stop the server")
	select {}
}
