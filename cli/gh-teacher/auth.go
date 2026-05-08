package main

import (
	"errors"
	"fmt"
	"os"
	"os/exec"
	"strings"

	"github.com/spf13/cobra"
)

func authCmd() *cobra.Command {
	var scopes []string

	cmd := &cobra.Command{
		Use:   "auth",
		Short: "Refresh gh authentication with teacher-level scopes",
		Long: "Wrapper around `gh auth refresh` that always requests the admin:org scope.\n\n" +
			"The admin:org scope is required by GitHub's organization-membership endpoints\n" +
			"(used by `gh teacher invite ORG USER`) and is not part of the default scope set\n" +
			"granted by `gh auth login`.\n\n" +
			"Additional scopes can be added with -s; they are appended to the request the\n" +
			"same way `gh auth refresh -s` accepts them.",
		Example: "  gh teacher auth\n" +
			"  gh teacher auth -s read:user\n" +
			"  gh teacher auth -s read:user,delete_repo",
		Args: cobra.NoArgs,
		RunE: func(cmd *cobra.Command, args []string) error {
			cmd.SilenceUsage = true

			if fi, err := os.Stdin.Stat(); err == nil && (fi.Mode()&os.ModeCharDevice) == 0 {
				return errors.New("gh teacher auth requires an interactive terminal (it shells out to gh auth refresh, which opens a browser)")
			}

			ghArgs := []string{"auth", "refresh", "-s", "admin:org"}
			for _, s := range scopes {
				s = strings.TrimSpace(s)
				if s == "" {
					continue
				}
				ghArgs = append(ghArgs, "-s", s)
			}

			sub := exec.Command("gh", ghArgs...)
			sub.Stdin = os.Stdin
			sub.Stdout = cmd.OutOrStdout()
			sub.Stderr = cmd.ErrOrStderr()

			if err := sub.Run(); err != nil {
				return fmt.Errorf("gh auth refresh: %w", err)
			}
			return nil
		},
	}

	cmd.Flags().StringSliceVarP(&scopes, "scopes", "s", nil, "Additional scopes to request (repeatable, or comma-separated)")

	return cmd
}
