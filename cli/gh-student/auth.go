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
		Short: "Refresh gh authentication with student-level scopes",
		Long: "Wrapper around `gh auth refresh` that always requests the read:org and repo\n" +
			"scopes student commands need (read:org for the org-membership lookup in\n" +
			"`gh student accept`, and repo for assignment-repo creation/collaborator\n" +
			"management).\n\n" +
			"Additional scopes can be added with -s; they are appended to the request the\n" +
			"same way `gh auth refresh -s` accepts them.",
		Example: "  gh student auth\n" +
			"  gh student auth -s workflow",
		Args: cobra.NoArgs,
		RunE: func(cmd *cobra.Command, args []string) error {
			cmd.SilenceUsage = true

			// gh auth refresh opens a browser / device-flow prompt, so it can't run
			// non-interactively. Fail fast in CI/piped contexts instead of hanging
			// silently on a prompt the caller can't see.
			if fi, err := os.Stdin.Stat(); err == nil && (fi.Mode()&os.ModeCharDevice) == 0 {
				return errors.New("gh student auth requires an interactive terminal (it shells out to gh auth refresh, which opens a browser)")
			}

			ghArgs := []string{"auth", "refresh", "-s", "read:org", "-s", "repo"}
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
