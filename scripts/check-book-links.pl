#!/usr/bin/env perl
use strict;
use warnings;
use utf8;
use Cwd qw(abs_path);
use File::Basename qw(dirname);
use File::Find qw(find);
use File::Spec;

my $source_root = abs_path($ARGV[0] // 'book/src')
    or die "book source directory does not exist\n";
my $summary = File::Spec->catfile($source_root, 'SUMMARY.md');

my @markdown;
find(
    sub {
        return unless -f $_ && /\.md\z/;
        push @markdown, abs_path($File::Find::name);
    },
    $source_root
);

my %summary_pages;
my @errors;
for my $file (@markdown) {
    open my $handle, '<:encoding(UTF-8)', $file
        or die "cannot read $file: $!\n";
    local $/;
    my $content = <$handle>;

    while ($content =~ /!?(?:\[[^\]]*\])\(([^)]+)\)/g) {
        my $target = $1;
        $target =~ s/^<|>$//g;
        next if $target =~ m{^(?:https?://|mailto:|#)};
        $target =~ s/[#?].*\z//;
        next if $target eq '';

        my $resolved = File::Spec->rel2abs($target, dirname($file));
        if (!-e $resolved) {
            my $relative_file = File::Spec->abs2rel($file, $source_root);
            push @errors, "$relative_file -> $target does not exist";
            next;
        }

        if ($file eq $summary && $target =~ /\.md\z/) {
            $summary_pages{abs_path($resolved)} = 1;
        }
    }
}

for my $file (@markdown) {
    next if $file eq $summary;
    next if $summary_pages{$file};
    push @errors, File::Spec->abs2rel($file, $source_root) . ' is missing from SUMMARY.md';
}

if (@errors) {
    print STDERR "book link check failed:\n";
    print STDERR "  - $_\n" for @errors;
    exit 1;
}

print 'book links OK: ', scalar(@markdown) - 1,
    " pages are listed and all local targets exist\n";
