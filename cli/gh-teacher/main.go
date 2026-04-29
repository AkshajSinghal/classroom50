package main

import (
	"fmt"
	"os"

	"github.com/cli/go-gh/v2/pkg/api"
	"github.com/spf13/cobra"
)

var version = "dev"

func main() {
	root := &cobra.Command{
		Use:           "gh-teacher",
		Short:         "Instructor-facing GitHub CLI extension",
		Version:       version,
		SilenceUsage:  true,
		SilenceErrors: true,
	}

	root.AddCommand(&cobra.Command{
		Use:   "whoami",
		Short: "Print the authenticated GitHub user",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, args []string) error {
			client, err := api.DefaultRESTClient()
			if err != nil {
				return fmt.Errorf("REST client: %w", err)
			}
			var user struct {
				Login string `json:"login"`
			}
			if err := client.Get("user", &user); err != nil {
				return fmt.Errorf("GET /user: %w", err)
			}
			fmt.Println(user.Login)
			return nil
		},
	})

	if err := root.Execute(); err != nil {
		fmt.Fprintln(os.Stderr, "gh-teacher:", err)
		os.Exit(1)
	}
}
