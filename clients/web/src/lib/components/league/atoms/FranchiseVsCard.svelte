<script lang="ts">
    import Color from "color";

    import type {LeagueScheduleFranchise} from "../../../api";
    export let profile: LeagueScheduleFranchise;

    // Use whichever color has a higher luminosity
    let applicableFontVar = "";
    const primary = new Color(profile.primaryColor);
    const secondary = new Color(profile.secondaryColor);
    $: applicableFontVar =
        primary.luminosity() > secondary.luminosity()
            ? "text-context-primary"
            : "text-context-secondary";
</script>

<div
    class="flex-1 flex-col items-center gap-2"
    style="--primary-color: {profile.primaryColor}; --secondary-color: {profile.secondaryColor}"
>
    <div
        class="aspect-square rounded-full w-16 h-16 p-2 mx-auto bg-gradient-to-br from-context-primary to-context-secondary flex justify-center items-center"
    >
        <img
            class="max-w-full max-h-full"
            src={profile.photo?.url}
            alt={profile.title}
        />
    </div>
    <span class="block text-xl {applicableFontVar} font-bold text-center"
        >{profile.title}</span
    >
</div>
