package configrepo

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/foundation50/gh-teacher/internal/githubtest"
)

func TestStaffTeamName(t *testing.T) {
	cases := []struct {
		short string
		role  StaffRole
		want  string
	}{
		{"cs-principles", RoleInstructor, "classroom50-cs-principles-instructor"},
		{"cs-principles", RoleTA, "classroom50-cs-principles-ta"},
		{"cs50", RoleInstructor, "classroom50-cs50-instructor"},
	}
	for _, tc := range cases {
		if got := staffTeamName(tc.short, tc.role); got != tc.want {
			t.Errorf("staffTeamName(%q, %q) = %q, want %q", tc.short, tc.role, got, tc.want)
		}
	}
}

// TestEnsureStaffTeams verifies both staff teams are created and each is
// granted push (write) on the config repo, and that the returned refs
// carry the created ids/slugs.
func TestEnsureStaffTeams(t *testing.T) {
	var createdNames []string
	grantPerms := map[string]string{} // slug -> permission

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.URL.Path == "/orgs/o/teams" && r.Method == http.MethodPost:
			var body struct {
				Name    string `json:"name"`
				Privacy string `json:"privacy"`
			}
			_ = json.NewDecoder(r.Body).Decode(&body)
			if body.Privacy != "secret" {
				t.Errorf("team %q created with privacy %q, want secret", body.Name, body.Privacy)
			}
			createdNames = append(createdNames, body.Name)
			// slug == name (canonical short-name).
			_ = json.NewEncoder(w).Encode(map[string]any{"id": int64(len(createdNames)), "slug": body.Name})
		case strings.HasPrefix(r.URL.Path, "/orgs/o/teams/") && strings.Contains(r.URL.Path, "/repos/") && r.Method == http.MethodGet:
			// No access yet.
			w.WriteHeader(http.StatusNotFound)
		case strings.HasPrefix(r.URL.Path, "/orgs/o/teams/") && strings.Contains(r.URL.Path, "/repos/") && r.Method == http.MethodPut:
			var body struct {
				Permission string `json:"permission"`
			}
			_ = json.NewDecoder(r.Body).Decode(&body)
			// slug is the segment between /teams/ and /repos/.
			slug := strings.TrimPrefix(r.URL.Path, "/orgs/o/teams/")
			slug = strings.SplitN(slug, "/repos/", 2)[0]
			grantPerms[slug] = body.Permission
			w.WriteHeader(http.StatusNoContent)
		default:
			t.Errorf("unexpected request: %s %s", r.Method, r.URL.Path)
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(server.Close)
	client := githubtest.NewTestClient(t, server)

	refs, err := EnsureStaffTeams(client, "o", "cs-principles")
	if err != nil {
		t.Fatalf("EnsureStaffTeams: %v", err)
	}
	if refs.Instructor == nil || refs.Instructor.Slug != "classroom50-cs-principles-instructor" {
		t.Errorf("instructor ref = %+v, want slug classroom50-cs-principles-instructor", refs.Instructor)
	}
	if refs.TA == nil || refs.TA.Slug != "classroom50-cs-principles-ta" {
		t.Errorf("ta ref = %+v, want slug classroom50-cs-principles-ta", refs.TA)
	}
	if len(createdNames) != 2 {
		t.Fatalf("created %d teams, want 2: %v", len(createdNames), createdNames)
	}
	for _, slug := range []string{"classroom50-cs-principles-instructor", "classroom50-cs-principles-ta"} {
		if grantPerms[slug] != "push" {
			t.Errorf("staff team %q granted %q on config repo, want push", slug, grantPerms[slug])
		}
	}
}

// TestGrantTeamRepoWrite requests push, and is idempotent when the team
// already has access.
func TestGrantTeamRepoWrite(t *testing.T) {
	t.Run("grants push when no access", func(t *testing.T) {
		var gotPerm string
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			switch r.Method {
			case http.MethodGet:
				w.WriteHeader(http.StatusNotFound)
			case http.MethodPut:
				var body struct {
					Permission string `json:"permission"`
				}
				_ = json.NewDecoder(r.Body).Decode(&body)
				gotPerm = body.Permission
				w.WriteHeader(http.StatusNoContent)
			}
		}))
		t.Cleanup(server.Close)
		client := githubtest.NewTestClient(t, server)

		granted, err := GrantTeamRepoWrite(client, "o", "classroom50-x-instructor", "o", "classroom50")
		if err != nil {
			t.Fatalf("GrantTeamRepoWrite: %v", err)
		}
		if !granted {
			t.Errorf("granted = false, want true on a fresh grant")
		}
		if gotPerm != "push" {
			t.Errorf("permission = %q, want push", gotPerm)
		}
	})

	t.Run("no-op when team already has access", func(t *testing.T) {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.Method == http.MethodGet {
				w.WriteHeader(http.StatusNoContent) // already has access
				return
			}
			t.Errorf("unexpected %s (should skip the PUT)", r.Method)
		}))
		t.Cleanup(server.Close)
		client := githubtest.NewTestClient(t, server)

		granted, err := GrantTeamRepoWrite(client, "o", "classroom50-x-instructor", "o", "classroom50")
		if err != nil {
			t.Fatalf("GrantTeamRepoWrite: %v", err)
		}
		if granted {
			t.Errorf("granted = true, want false when access already present")
		}
	})
}

// TestDeleteClassroomTeam_NamespaceGuard refuses to delete a team whose
// slug isn't classroom50-namespaced, without issuing any request.
func TestDeleteClassroomTeam_NamespaceGuard(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Errorf("must not issue any request for a non-namespaced slug: %s %s", r.Method, r.URL.Path)
		http.NotFound(w, r)
	}))
	t.Cleanup(server.Close)
	client := githubtest.NewTestClient(t, server)

	err := DeleteClassroomTeam(client, "o", TeamRef{ID: 5, Slug: "some-unrelated-team"})
	if err == nil || !strings.Contains(err.Error(), "refusing to delete") {
		t.Fatalf("err = %v, want a namespace-guard refusal", err)
	}
}

// TestDeleteClassroomTeam_RefusesZeroID is the load-bearing fail-closed
// guard: a classroom50--prefixed ref with a non-positive id (a
// hand-edited or pre-id classroom.json) must NOT be deleted blind, and
// must issue no DELETE — mirroring the web's positive-id requirement.
func TestDeleteClassroomTeam_RefusesZeroID(t *testing.T) {
	for _, id := range []int64{0, -1} {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			t.Errorf("must not issue any request for an id<=0 ref: %s %s", r.Method, r.URL.Path)
			http.NotFound(w, r)
		}))
		client := githubtest.NewTestClient(t, server)
		err := DeleteClassroomTeam(client, "o", TeamRef{ID: id, Slug: "classroom50-other-instructor"})
		server.Close()
		if err == nil || !strings.Contains(err.Error(), "no recorded id") {
			t.Errorf("id=%d: err = %v, want a fail-closed 'no recorded id' refusal", id, err)
		}
	}
}

// TestIsDeletableClassroomTeamRef pins the shared predicate: deletable
// only when classroom50--prefixed AND id>0 (mirrors the web).
func TestIsDeletableClassroomTeamRef(t *testing.T) {
	cases := []struct {
		team TeamRef
		want bool
	}{
		{TeamRef{ID: 1, Slug: "classroom50-cs-instructor"}, true},
		{TeamRef{ID: 0, Slug: "classroom50-cs-instructor"}, false},
		{TeamRef{ID: -1, Slug: "classroom50-cs-instructor"}, false},
		{TeamRef{ID: 1, Slug: "other-team"}, false},
		{TeamRef{ID: 1, Slug: ""}, false},
	}
	for _, tc := range cases {
		if got := IsDeletableClassroomTeamRef(tc.team); got != tc.want {
			t.Errorf("IsDeletableClassroomTeamRef(%+v) = %v, want %v", tc.team, got, tc.want)
		}
	}
}

// TestEnsureClassroomStaffTeam_AdoptsExisting422 covers the adopt path:
// a 422 name-collision reads the existing team and reconciles a non-secret
// privacy to secret.
func TestEnsureClassroomStaffTeam_AdoptsExisting422(t *testing.T) {
	var patched bool
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.URL.Path == "/orgs/o/teams" && r.Method == http.MethodPost:
			w.WriteHeader(http.StatusUnprocessableEntity)
			_, _ = w.Write([]byte(`{"message":"name already taken"}`))
		case r.URL.Path == "/orgs/o/teams/classroom50-cs-instructor" && r.Method == http.MethodGet:
			_ = json.NewEncoder(w).Encode(map[string]any{"id": 7, "slug": "classroom50-cs-instructor", "privacy": "closed"})
		case r.URL.Path == "/orgs/o/teams/classroom50-cs-instructor" && r.Method == http.MethodPatch:
			patched = true
			w.WriteHeader(http.StatusOK)
		default:
			t.Errorf("unexpected request: %s %s", r.Method, r.URL.Path)
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(server.Close)
	client := githubtest.NewTestClient(t, server)

	ref, err := EnsureClassroomStaffTeam(client, "o", "cs", RoleInstructor)
	if err != nil {
		t.Fatalf("EnsureClassroomStaffTeam adopt: %v", err)
	}
	if ref.ID != 7 || ref.Slug != "classroom50-cs-instructor" {
		t.Errorf("adopted ref = %+v, want id 7 / classroom50-cs-instructor", ref)
	}
	if !patched {
		t.Errorf("expected a PATCH reconciling privacy to secret on the closed team")
	}
}
