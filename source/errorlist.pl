#!perl -w

use strict;
use warnings;

my (%groups, %types);

my @files = cpp_files('.');
for (@files) {
  open my $f, $_ or die "Error opening file '$_' ($!)";
  while (<$f>) {
    if (/^ERROR_/) {
      if (/^ERROR_GROUP\((.+?)\)/) {
        $groups{join '~', split /,\s*/, $1} = 1;
      } elsif (/^ERROR_TYPE\((.+?)\)/) {
        $types{join '~', split /,\s*/, $1} = 1;
      }
    }
  }
}

open my $out, '>', 'ps/Errors.cpp' or die "Error opening ps/Errors.cpp ($!)";

print $out <<'.';
// Auto-generated by errorlist.pl - do not edit
#include "precompiled.h"

#include "Errors.h"

// Slightly hacky section to redeclare things that are declared
// elsewhere - trust the compiler to handle them identically
.

for (sort keys %groups) {
  my ($base, $name) = split /~/;
  print $out "class ${base}_$name : public $base {};\n";
}

for (sort keys %types) {
  my ($base, $name) = split /~/;
  print $out "class ${base}_$name : public $base { public: ${base}_$name(); };\n";
}

print $out "\n// The relevant bits of this file:\n";

@types{sort keys %types} = 0 .. keys(%types)-1;

for (sort keys %types) {
  my ($base, $name) = split /~/;
  print $out "${base}_${name}::${base}_${name}() { magic=0x50534552; code=$types{$_}; }\n";
}

print $out <<".";

const wchar_t* GetErrorString(int code)
{
\tswitch (code)
\t{
.

for (sort keys %types) {
  (my $name = $_) =~ s/~/_/;
  $name =~ s/.*?_//;
  print $out qq{\tcase $types{$_}: return L"$name"; break;\n};
}

print $out <<".";
\t}
\treturn L"Unrecognised error";
}
.


sub cpp_files {
  opendir my $d, $_[0] or die "Error opening directory '$_[0]' ($!)";
  my @f = readdir $d;
  my @files = map "$_[0]/$_", grep /\.(?:cpp|h)$/, @f;
  push @files, cpp_files($_) for grep { /^[a-z]+$/ and -d } @f;
  return @files;
}
