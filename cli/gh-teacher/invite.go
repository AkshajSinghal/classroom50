package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"

	"github.com/cli/go-gh/v2/pkg/api"
	"github.com/spf13/cobra"
)

var repoPermissions = []string{"pull", "triage", "push", "maintain", "admin"}

func inviteCmd() *cobra.Command {
	var (
		admin      bool
		permission string
		quiet      bool
	)

	cmd := &cobra.Command{
		Use:   "invite <org>[/<repo>] <username>",
		Short: "Invite a user to an organization or repository",
		Long: "Invite a GitHub user to an organization or to a specific repository.\n\n" +
			"Forms:\n" +
			"  gh teacher invite <org> <username>                         # invite to organization (direct_member)\n" +
			"  gh teacher invite --admin <org> <username>                 # invite to organization as admin\n" +
			"  gh teacher invite <org>/<repo> <username>                  # invite to repository (push permission)\n" +
			"  gh teacher invite -p maintain <org>/<repo> <username>      # invite to repository as maintainer\n\n" +
			"Repository invitations are idempotent: re-running with a different --permission\n" +
			"updates the existing collaborator. Organization invitations are not: GitHub\n" +
			"rejects re-invites to a pending or existing member.",
		Example: "  gh teacher invite cs50-fall-2026 alice\n" +
			"  gh teacher invite --admin cs50-fall-2026 alice\n" +
			"  gh teacher invite cs50-fall-2026/hello alice\n" +
			"  gh teacher invite -p maintain cs50-fall-2026/hello alice",
		Args: cobra.ExactArgs(2),
		RunE: func(cmd *cobra.Command, args []string) error {
			cmd.SilenceUsage = true
			target := strings.TrimSpace(args[0])
			username := strings.TrimSpace(args[1])
			if target == "" {
				return errors.New("target must not be empty")
			}
			if username == "" {
				return errors.New("username must not be empty")
			}

			client, err := api.DefaultRESTClient()
			if err != nil {
				return fmt.Errorf("REST client: %w", err)
			}

			out := cmd.OutOrStdout()
			errOut := cmd.ErrOrStderr()

			if strings.Contains(target, "/") {
				if admin {
					return errors.New("--admin is only valid for organization invitations")
				}
				if !validRepoPermission(permission) {
					return fmt.Errorf("invalid --permission %q: expected one of %s", permission, strings.Join(repoPermissions, ", "))
				}
				parts := strings.SplitN(target, "/", 3)
				if len(parts) != 2 || parts[0] == "" || parts[1] == "" {
					return fmt.Errorf("invalid target %q: expected ORG or ORG/REPO", target)
				}
				return inviteToRepo(client, out, parts[0], parts[1], username, permission, quiet)
			}

			if cmd.Flags().Changed("permission") {
				return errors.New("--permission is only valid for repository invitations")
			}
			role := "direct_member"
			if admin {
				role = "admin"
			}
			return inviteToOrg(client, out, errOut, target, username, role, quiet)
		},
	}

	cmd.Flags().BoolVar(&admin, "admin", false, "Invite as organization admin (org targets only)")
	cmd.Flags().StringVarP(&permission, "permission", "p", "push", "Repository permission: pull, triage, push, maintain, admin (repo targets only)")
	cmd.Flags().BoolVarP(&quiet, "quiet", "q", false, "Suppress success output (errors still go to stderr)")

	return cmd
}

func validRepoPermission(p string) bool {
	for _, allowed := range repoPermissions {
		if p == allowed {
			return true
		}
	}
	return false
}

func inviteToOrg(client *api.RESTClient, out, errOut io.Writer, org, username, role string, quiet bool) error {
	userID, err := lookupUserID(client, username)
	if err != nil {
		return fmt.Errorf("lookup user %s: %w", username, err)
	}

	body, err := json.Marshal(map[string]any{
		"invitee_id": userID,
		"role":       role,
	})
	if err != nil {
		return fmt.Errorf("encode body: %w", err)
	}

	path := fmt.Sprintf("orgs/%s/invitations", url.PathEscape(org))
	if err := client.Post(path, bytes.NewReader(body), nil); err != nil {
		return fmt.Errorf("POST %s: %w", path, err)
	}

	if !quiet {
		_, _ = fmt.Fprintf(out, "%s: invited %s as %s\n", org, username, role)
		_, _ = fmt.Fprintf(errOut, "Advise %s to visit https://github.com/%s to accept the invitation atop the page.\n", username, org)
	}
	return nil
}

func lookupUserID(client *api.RESTClient, username string) (int64, error) {
	path := fmt.Sprintf("users/%s", url.PathEscape(username))
	var user struct {
		ID int64 `json:"id"`
	}
	if err := client.Get(path, &user); err != nil {
		return 0, fmt.Errorf("GET %s: %w", path, err)
	}
	return user.ID, nil
}

func inviteToRepo(client *api.RESTClient, out io.Writer, owner, repo, username, permission string, quiet bool) error {
	body, err := json.Marshal(map[string]string{"permission": permission})
	if err != nil {
		return fmt.Errorf("encode body: %w", err)
	}

	path := fmt.Sprintf("repos/%s/%s/collaborators/%s",
		url.PathEscape(owner), url.PathEscape(repo), url.PathEscape(username))
	resp, err := client.Request(http.MethodPut, path, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("PUT %s: %w", path, err)
	}
	defer func() { _ = resp.Body.Close() }()
	_, _ = io.Copy(io.Discard, resp.Body)

	var msg string
	switch resp.StatusCode {
	case http.StatusCreated:
		msg = fmt.Sprintf("%s/%s: invited %s with %s permission (awaiting acceptance)\n", owner, repo, username, permission)
	case http.StatusNoContent:
		msg = fmt.Sprintf("%s/%s: added %s with %s permission\n", owner, repo, username, permission)
	default:
		return fmt.Errorf("PUT %s: unexpected status %d", path, resp.StatusCode)
	}
	if !quiet {
		_, _ = fmt.Fprint(out, msg)
	}
	return nil
}
