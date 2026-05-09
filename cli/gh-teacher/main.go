package main

import (
	"os"

	"github.com/spf13/cobra"
)

var (
	version = "dev"

	// verbose is the project-wide --verbose / -v flag. When true, subcommands
	// surface per-step operational details (e.g. each REST call, each
	// intermediate file write) instead of just the final outcome and the
	// user's next action. Off by default so the success path stays focused
	// on what the user cares about.
	verbose bool
)

func main() {
	root := &cobra.Command{
		Use:     "gh-teacher",
		Short:   "Instructor-facing GitHub CLI extension",
		Version: version,
	}
	root.SetErrPrefix("gh-teacher:")
	root.PersistentFlags().BoolVarP(&verbose, "verbose", "v", false, "Show operational details (per-step API/git output)")

	root.AddCommand(whoamiCmd())
	root.AddCommand(authCmd())
	root.AddCommand(inviteCmd())
	root.AddCommand(removeCmd())
	root.AddCommand(downloadCmd())

	if err := root.Execute(); err != nil {
		os.Exit(1)
	}
}
