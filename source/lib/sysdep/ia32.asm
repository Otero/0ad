; set 32-bit attribute once for all sections and activate .text
section .data use32
section .bss use32
section .text use32

;-------------------------------------------------------------------------------
; fast general memcpy
;-------------------------------------------------------------------------------

; optimized for Athlon XP: 7.3% faster (cumulative) than VC7.1's memcpy over
; all 1..64 byte transfer lengths and misalignments. approaches maximum
; mem bandwidth (2000 MiB/s) for transfers >= 192KiB!
; Pentium III performance: about 3% faster in above small buffer benchmark.
;
; disables specialized large transfer (> 64KiB) implementations if SSE
; isn't available; we do assume MMX support, though (quite safe).

; *requires* (and does not verify the presence of) SSE instructions:
; prefetchnta and movntq. therefore, a P3+ or Athlon XP is required.
; rationale: older processors are too slow anyway and we don't bother.

; if memcpy size is greater than this,
; .. it's too big for L1. use non-temporal instructions.
UC_THRESHOLD	equ	64*1024
; .. it also blows L2. pull chunks into L1 ("block prefetch").
BP_THRESHOLD	equ	192*1024

; maximum that can be copied by IC_MOVSD.
; if you change this, be sure to expand the movs* table(s)!
IC_SIZE		equ	67

; size of one block prefetch chunk.
; if you change this, make sure "push byte BP_SIZE/128" doesn't overflow!
BP_SIZE		equ	8*1024


; > ecx = size (<= IC_SIZE)
; x eax, ecx
;
; determined to be fastest approach by testing. a movsd table followed by
; rep movsb is a bit smaller but 6.9% slower; everything else is much worse.
%macro IC_MOVSD 0
	mov		eax, ecx
	shr		ecx, 2						; dword count
	neg		ecx
	add		ecx, %%movsd_table_end
	jmp		ecx
align 8
	movsd
	movsd
	movsd
	movsd
	movsd
	movsd
	movsd
	movsd
	movsd
	movsd
	movsd
	movsd
	movsd
	movsd
	movsd
	movsd
%%movsd_table_end:

	and		eax, 3
	neg		eax
	add		eax, %%movsb_table_end
	jmp		eax
	movsb
	movsb
	movsb
%%movsb_table_end:
%endm


; align destination address to multiple of 8.
; not done for small transfers because it doesn't help IC_MOVSD.
%macro IC_ALIGN 0
	mov		eax, 8
	sub		eax, edi
	and		eax, byte 7					; eax = # misaligned bytes
	sub		ecx, eax					; reduce copy count
	neg		eax
	add		eax, %%align_table_end
	jmp		eax
align 4
	movsb
	movsb
	movsb
	movsb
	movsb
	movsb
	movsb
	movsb
%%align_table_end:
%endm


; > ecx = size
; x edx
%macro IC_MOVQ 0
align 16
	mov		edx, 64
%%loop:
	cmp		ecx, edx
	jb		%%done
	prefetchnta	[esi + (200*64/34+192)]
	movq	mm0, [esi+0]
	movq	mm1, [esi+8]
	movq	[edi+0], mm0
	movq	[edi+8], mm1
	movq	mm2, [esi+16]
	movq	mm3, [esi+24]
	movq	[edi+16], mm2
	movq	[edi+24], mm3
	movq	mm0, [esi+32]
	movq	mm1, [esi+40]
	movq	[edi+32], mm0
	movq	[edi+40], mm1
	movq	mm2, [esi+48]
	movq	mm3, [esi+56]
	movq	[edi+48], mm2
	movq	[edi+56], mm3
	add		esi, edx
	add		edi, edx
	sub		ecx, edx
	jmp		%%loop
%%done:
%endm


; > ecx = size (> 64)
; x
%macro UC_MOVNTQ 0
	mov		edx, 64
align 16
%%1:
	prefetchnta [esi + (200*64/34+192)]
	movq	mm0,[esi+0]
	add		edi, edx
	movq	mm1,[esi+8]
	add		esi, edx
	movq	mm2,[esi-48]
	movntq	[edi-64], mm0
	movq	mm0,[esi-40]
	movntq	[edi-56], mm1
	movq	mm1,[esi-32]
	movntq	[edi-48], mm2
	movq	mm2,[esi-24]
	movntq	[edi-40], mm0
	movq	mm0,[esi-16]
	movntq	[edi-32], mm1
	movq	mm1,[esi-8]
	movntq	[edi-24], mm2
	movntq	[edi-16], mm0
	sub		ecx, edx
	movntq	[edi-8], mm1
	cmp		ecx, edx
	jae		%%1
%endm


; > ecx = size (> 8KiB)
; x eax, edx
;
; somewhat optimized for size (futile attempt to avoid near jump)
%macro UC_BP_MOVNTQ 0
%%prefetch_and_copy_chunk:

	; touch each cache line within chunk in reverse order (prevents HW prefetch)
	push	byte BP_SIZE/128			; # iterations
	pop		eax
	add		esi, BP_SIZE
align 8
%%prefetch_chunk:
	mov		edx, [esi-64]
	mov		edx, [esi-128]
	sub		esi, 128
	dec		eax
	jnz		%%prefetch_chunk

	; copy 64 byte blocks
	mov		eax, BP_SIZE/64				; # iterations (> signed 8 bit)
	push	byte 64
	pop		edx
align 8
%%copy_block:
	movq	mm0, [esi+ 0]
	movq	mm1, [esi+ 8]
	movq	mm2, [esi+16]
	movq	mm3, [esi+24]
	movq	mm4, [esi+32]
	movq	mm5, [esi+40]
	movq	mm6, [esi+48]
	movq	mm7, [esi+56]
	add		esi, edx
	movntq	[edi+ 0], mm0
	movntq	[edi+ 8], mm1
	movntq	[edi+16], mm2
	movntq	[edi+24], mm3
	movntq	[edi+32], mm4
	movntq	[edi+40], mm5
	movntq	[edi+48], mm6
	movntq	[edi+56], mm7
	add		edi, edx
	dec		eax
	jnz		%%copy_block

	sub		ecx, BP_SIZE
	cmp		ecx, BP_SIZE
	jae		%%prefetch_and_copy_chunk
%endm


[section .bss]

; this is somewhat "clever". the 2 specialized transfer implementations
; that use SSE are jumped to if transfer size is greater than a threshold.
; we simply set the requested transfer size to 0 if the CPU doesn't
; support SSE so that those are never reached (done by masking with this).
sse_mask		resd	1

__SECT__

; void __declspec(naked) ia32_memcpy(void* dst, const void* src, size_t nbytes)
global _ia32_memcpy
_ia32_memcpy:
	push	edi
	push	esi

	mov		edi, [esp+8+4+0]			; dst
	mov		esi, [esp+8+4+4]			; src
	mov		ecx, [esp+8+4+8]			; nbytes

	cmp		ecx, byte IC_SIZE
	ja		.choose_larger_method

.ic_movsd:
	IC_MOVSD
	pop		esi
	pop		edi
	ret

.choose_larger_method:
	IC_ALIGN

	mov		eax, [sse_mask]
	mov		edx, ecx
	and		edx, eax					; edx = (SSE)? remaining_bytes : 0
	cmp		edx, BP_THRESHOLD
	jae		near .uc_bp_movntq
	cmp		edx, UC_THRESHOLD
	jae		.uc_movntq

.ic_movq:
	IC_MOVQ
	emms
	jmp		.ic_movsd

.uc_movntq:
	UC_MOVNTQ
	sfence
	emms
	jmp		.ic_movsd

.uc_bp_movntq:
	UC_BP_MOVNTQ
	sfence
	jmp		.ic_movq



;-------------------------------------------------------------------------------
; CPUID support
;-------------------------------------------------------------------------------

[section .data]

; these are actually max_func+1, i.e. the first invalid value.
; the idea here is to avoid a separate cpuid_available flag;
; using signed values doesn't work because ext_funcs are >= 0x80000000.
max_func		dd	0
max_ext_func	dd	0

__SECT__


; extern "C" bool __cdecl ia32_cpuid(u32 func, u32* regs)
global _ia32_cpuid
_ia32_cpuid:
	push	ebx
	push	edi

	mov		ecx, [esp+8+4+0]			; func
	mov		edi, [esp+8+4+4]			; -> regs

	; compare against max supported func and fail if above
	xor		eax, eax					; return value on failure
	test	ecx, ecx
	mov		edx, [max_ext_func]
	js		.is_ext_func
	mov		edx, [max_func]
.is_ext_func:
	cmp		ecx, edx
	jae		.ret						; (see max_func decl)

	; issue CPUID and store result registers in array
	mov		eax, ecx
	cpuid
	stosd
	xchg		eax, ebx
	stosd
	xchg		eax, ecx
	stosd
	xchg		eax, edx
	stosd

	; success
	xor		eax, eax
	inc		eax
.ret:
	pop		edi
	pop		ebx
	ret


;-------------------------------------------------------------------------------
; misc
;-------------------------------------------------------------------------------

; extern "C" uint __cdecl ia32_control87(uint new_cw, uint mask)
global _ia32_control87
_ia32_control87:
	push	eax
	fnstcw	[esp]
	pop		eax							; old_cw
	mov		ecx, [esp+4]				; new_cw
	mov		edx, [esp+8]				; mask
	and		ecx, edx					; new_cw & mask
	not		edx							; ~mask
	and		eax, edx					; old_cw & ~mask
	or		eax, ecx					; (old_cw & ~mask) | (new_cw & mask)
	push	edx
	fldcw	[esp]
	pop		edx
	xor		eax, eax					; return value
	
	
;-------------------------------------------------------------------------------
; init
;-------------------------------------------------------------------------------
	
; extern "C" bool __cdecl ia32_init()
global _ia32_init
_ia32_init:
	push	ebx

	; check if CPUID is supported
	pushfd
	or		byte [esp+2], 32
	popfd
	pushfd
	pop		eax
	xor		edx, edx
	shr		eax, 22						; bit 21 toggled?
	jnc		.no_cpuid

	; determine max supported CPUID function
	xor		eax, eax
	cpuid
	inc		eax							; (see max_func decl)
	mov		[max_func], eax
	mov		eax, 0x80000000
	cpuid
	inc		eax							; (see max_func decl)
	mov		[max_ext_func], eax
.no_cpuid:

	; check if SSE is supported (used by memcpy code)
extern _ia32_cap
	push	byte 32+25					; ia32.h's SSE cap (won't change)
	call	_ia32_cap
	pop		edx							; remove stack param
	neg		eax							; SSE? ~0 : 0
	mov		[sse_mask], eax

	pop		ebx
	ret