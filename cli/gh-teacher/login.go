package main

import (
	"errors"
	"fmt"
	"os"
	"os/exec"
	"strings"

	"github.com/spf13/cobra"
)

func loginCmd() *cobra.Command {
	var scopes []string

	cmd := &cobra.Command{
		Use:   "login",
		Short: "Log in to GitHub with the scopes gh-teacher needs",
		Long: "Wrapper around `gh auth login` that always requests the admin:org\n" +
			"scope on top of the gh defaults. The admin:org scope is required\n" +
			"by GitHub's organization-membership endpoints (used by\n" +
			"`gh teacher invite <org> <user>`) and is not part of the default\n" +
			"scope set `gh auth login` grants on its own.\n\n" +
			"Additional scopes can be added with -s; they are appended to the\n" +
			"login request the same way `gh auth login -s` accepts them.",
		Example: "  gh teacher login\n" +
			"  gh teacher login -s read:user\n" +
			"  gh teacher login -s read:user,delete_repo",
		Args: cobra.NoArgs,
		RunE: func(cmd *cobra.Command, args []string) error {
			cmd.SilenceUsage = true

			if fi, err := os.Stdin.Stat(); err == nil && (fi.Mode()&os.ModeCharDevice) == 0 {
				return errors.New("gh teacher login requires an interactive terminal (it shells out to gh auth login, which opens a browser)")
			}

			ghArgs := []string{"auth", "login", "-s", "admin:org"}
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
				return fmt.Errorf("gh auth login: %w", err)
			}
			return nil
		},
	}

	cmd.Flags().StringSliceVarP(&scopes, "scopes", "s", nil, "Additional scopes to request (repeatable, or comma-separated)")

	return cmd
}
