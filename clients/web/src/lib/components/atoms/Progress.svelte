<style lang="postcss">
    .gear {
        @apply h-7 absolute top-0.5 text-base-200;

        :global(svg) {
            @apply animate-spin-slow;
        }
    }
</style>

<script lang="ts">
    import Gear from "./icons/Gear.svelte";

    export let value: number;
    export let max: number;

    let progressEl: HTMLProgressElement;
    let elWidth: number;
    $: elWidth = progressEl?.clientWidth;
</script>

<div class="flex gap-4 w-full items-center relative">
    <p>{value}</p>
    <progress
        class="progress progress-primary h-8"
        {value}
        {max}
        bind:this={progressEl}
    />
    <p>{max}</p>

    {#if value > max / 30}
        <span
            class="gear"
            style="transform: translateX(calc({(elWidth * value) /
                max}px - 0.5rem));"
        >
            <Gear />
        </span>
    {/if}
</div>
