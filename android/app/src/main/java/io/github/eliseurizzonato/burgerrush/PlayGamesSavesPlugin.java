package io.github.eliseurizzonato.burgerrush;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.games.AuthenticationResult;
import com.google.android.gms.games.GamesSignInClient;
import com.google.android.gms.games.PlayGames;
import com.google.android.gms.games.SnapshotsClient;
import com.google.android.gms.games.snapshot.Snapshot;
import com.google.android.gms.games.snapshot.SnapshotMetadataChange;
import com.google.android.gms.tasks.Task;
import java.nio.charset.StandardCharsets;

/** Save na nuvem pelo Google Play Games (Saved Games), exposto ao jogo como "PlayGamesSaves". */
@CapacitorPlugin(name = "PlayGamesSaves")
public class PlayGamesSavesPlugin extends Plugin {

    @PluginMethod
    public void signIn(PluginCall call) {
        GamesSignInClient client = PlayGames.getGamesSignInClient(getActivity());
        boolean interactive = call.getBoolean("interactive", false);
        Task<AuthenticationResult> task = interactive ? client.signIn() : client.isAuthenticated();
        task.addOnCompleteListener(t -> {
            boolean ok = t.isSuccessful() && t.getResult().isAuthenticated();
            if (!ok) {
                JSObject r = new JSObject();
                r.put("signedIn", false);
                call.resolve(r);
                return;
            }
            PlayGames.getPlayersClient(getActivity()).getCurrentPlayer().addOnCompleteListener(p -> {
                JSObject r = new JSObject();
                r.put("signedIn", true);
                r.put("name", p.isSuccessful() ? p.getResult().getDisplayName() : "");
                call.resolve(r);
            });
        });
    }

    @PluginMethod
    public void load(PluginCall call) {
        String name = call.getString("name");
        SnapshotsClient snaps = PlayGames.getSnapshotsClient(getActivity());
        snaps.open(name, true, SnapshotsClient.RESOLUTION_POLICY_MOST_RECENTLY_MODIFIED).addOnCompleteListener(t -> {
            if (!t.isSuccessful() || t.getResult().isConflict()) {
                call.reject("Não foi possível abrir o save na nuvem", t.getException());
                return;
            }
            Snapshot s = t.getResult().getData();
            try {
                byte[] bytes = s.getSnapshotContents().readFully();
                JSObject r = new JSObject();
                r.put("data", bytes.length > 0 ? new String(bytes, StandardCharsets.UTF_8) : null);
                call.resolve(r);
            } catch (Exception e) {
                call.reject("Erro ao ler o save na nuvem", e);
            } finally {
                snaps.discardAndClose(s);
            }
        });
    }

    @PluginMethod
    public void save(PluginCall call) {
        String name = call.getString("name");
        String data = call.getString("data", "");
        String description = call.getString("description", "");
        long progress = call.getInt("progress", 0);
        SnapshotsClient snaps = PlayGames.getSnapshotsClient(getActivity());
        snaps.open(name, true, SnapshotsClient.RESOLUTION_POLICY_MOST_RECENTLY_MODIFIED).addOnCompleteListener(t -> {
            if (!t.isSuccessful() || t.getResult().isConflict()) {
                call.reject("Não foi possível abrir o save na nuvem", t.getException());
                return;
            }
            Snapshot s = t.getResult().getData();
            s.getSnapshotContents().writeBytes(data.getBytes(StandardCharsets.UTF_8));
            SnapshotMetadataChange meta = new SnapshotMetadataChange.Builder()
                .setDescription(description)
                .setProgressValue(progress)
                .build();
            snaps.commitAndClose(s, meta).addOnCompleteListener(c -> {
                if (c.isSuccessful()) call.resolve();
                else call.reject("Erro ao gravar o save na nuvem", c.getException());
            });
        });
    }
}
